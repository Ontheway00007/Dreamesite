import { describe, expect, it } from "vitest";

import { getSuburbReference } from "@/content/suburb-references";
import {
  addressVisibilityPresets,
  isLocationVisibility,
  isPrivacyRadius,
  privacyRadiusLabel,
  privacyRadiusOptions,
} from "@/lib/properties/privacy-options";
import {
  approximateCoordinate,
  defaultPropertyPrivacy,
  formatPublicAddress,
  isMappable,
  resolvePublicLocation,
  toPublicProperty,
} from "@/lib/properties/privacy";
import type {
  AddressVisibility,
  PropertyPrivacySettings,
  PropertyRecord,
  PropertyStatus,
} from "@/types";

const EXACT_LATITUDE = -37.531234;
const EXACT_LONGITUDE = 144.886789;

function record(
  privacy: Partial<PropertyPrivacySettings> = {},
  overrides: Partial<PropertyRecord> = {},
): PropertyRecord {
  return {
    id: "test",
    slug: "test",
    name: "Test concept",
    summary: "A test property.",
    suburb: "Craigieburn",
    state: "VIC",
    status: "move-in-ready",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    landSize: 400,
    placeholderVariant: "single-storey",
    isFeatured: false,
    privateLatitude: EXACT_LATITUDE,
    privateLongitude: EXACT_LONGITUDE,
    address: { houseNumber: "27", street: "Example Street", postcode: "3064" },
    privacy: { ...defaultPropertyPrivacy, ...privacy },
    ...overrides,
  };
}

/** Metres between two coordinates, good enough for assertions at this scale. */
function distanceMeters(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const latitudeMeters = (bLat - aLat) * 111_320;
  const longitudeMeters =
    (bLon - aLon) * 111_320 * Math.cos((aLat * Math.PI) / 180);

  return Math.hypot(latitudeMeters, longitudeMeters);
}

describe("locationVisibility: exact", () => {
  it("publishes the stored position", () => {
    const location = resolvePublicLocation(
      record({ locationVisibility: "exact" }),
    );

    expect(location.publicLatitude).toBe(EXACT_LATITUDE);
    expect(location.publicLongitude).toBe(EXACT_LONGITUDE);
    expect(location.label).toBeNull();
    expect(location.accuracyRadiusMeters).toBeUndefined();
  });
});

describe("locationVisibility: approximate", () => {
  it("never publishes the stored position", () => {
    const location = resolvePublicLocation(
      record({ locationVisibility: "approximate", privacyRadiusMeters: 500 }),
    );

    expect(location.publicLatitude).not.toBe(EXACT_LATITUDE);
    expect(location.publicLongitude).not.toBe(EXACT_LONGITUDE);
    expect(location.label).toBe("Approximate location");
    expect(location.accuracyRadiusMeters).toBe(500);
  });

  it("stays within the configured radius", () => {
    for (const radius of privacyRadiusOptions) {
      const { publicLatitude, publicLongitude } = resolvePublicLocation(
        record({
          locationVisibility: "approximate",
          privacyRadiusMeters: radius,
        }),
      );

      const distance = distanceMeters(
        EXACT_LATITUDE,
        EXACT_LONGITUDE,
        publicLatitude as number,
        publicLongitude as number,
      );

      expect(distance).toBeLessThanOrEqual(radius);
    }
  });

  it("moves further as the radius grows", () => {
    const tight = resolvePublicLocation(
      record({ locationVisibility: "approximate", privacyRadiusMeters: 100 }),
    );
    const loose = resolvePublicLocation(
      record({ locationVisibility: "approximate", privacyRadiusMeters: 5000 }),
    );

    expect(
      distanceMeters(
        EXACT_LATITUDE,
        EXACT_LONGITUDE,
        tight.publicLatitude as number,
        tight.publicLongitude as number,
      ),
    ).toBeLessThan(
      distanceMeters(
        EXACT_LATITUDE,
        EXACT_LONGITUDE,
        loose.publicLatitude as number,
        loose.publicLongitude as number,
      ),
    );
  });

  it("is deterministic, so the marker never jumps between page loads", () => {
    const first = approximateCoordinate(EXACT_LATITUDE, EXACT_LONGITUDE, 500);

    for (let attempt = 0; attempt < 25; attempt += 1) {
      expect(approximateCoordinate(EXACT_LATITUDE, EXACT_LONGITUDE, 500)).toEqual(
        first,
      );
    }
  });

  it("is lossy: nearby positions collapse to the same marker", () => {
    // Two homes a few metres apart must not be distinguishable on the map,
    // otherwise the offset could be reversed to recover a position.
    const a = approximateCoordinate(-37.531234, 144.886789, 1000);
    const b = approximateCoordinate(-37.53125, 144.8868, 1000);

    expect(a).toEqual(b);
  });
});

describe("locationVisibility: suburb", () => {
  it("uses the suburb reference rather than the property position", () => {
    const reference = getSuburbReference("Craigieburn");
    const location = resolvePublicLocation(
      record({ locationVisibility: "suburb" }),
    );

    expect(location.publicLatitude).toBe(reference?.latitude);
    expect(location.publicLongitude).toBe(reference?.longitude);
    expect(location.label).toBe("Suburb only");
  });

  it("produces the same marker for every property in the suburb", () => {
    const one = resolvePublicLocation(record({ locationVisibility: "suburb" }));
    const two = resolvePublicLocation(
      record({ locationVisibility: "suburb" }, {
        privateLatitude: -37.61,
        privateLongitude: 144.99,
      }),
    );

    expect(one.publicLatitude).toBe(two.publicLatitude);
    expect(one.publicLongitude).toBe(two.publicLongitude);
  });

  it("honours an explicit suburb reference override", () => {
    const location = resolvePublicLocation(
      record({ locationVisibility: "suburb", suburbReference: "Mickleham" }),
    );

    expect(location.publicLatitude).toBe(
      getSuburbReference("Mickleham")?.latitude,
    );
  });

  it("publishes no marker when the suburb has no reference yet", () => {
    const location = resolvePublicLocation(
      record({ locationVisibility: "suburb", suburbReference: "Nowhere" }),
    );

    expect(location.publicLatitude).toBeUndefined();
  });
});

describe("locationVisibility: hidden", () => {
  it("publishes no coordinates at all", () => {
    const location = resolvePublicLocation(
      record({ locationVisibility: "hidden" }),
    );

    expect(location.publicLatitude).toBeUndefined();
    expect(location.publicLongitude).toBeUndefined();
    expect(location.label).toBe("Location available on enquiry");
  });

  it("wins over a manually placed marker", () => {
    const location = resolvePublicLocation(
      record({
        locationVisibility: "hidden",
        publicMarkerMode: "manual",
        manualLatitude: -37.5,
        manualLongitude: 144.9,
      }),
    );

    expect(location.publicLatitude).toBeUndefined();
  });

  it("leaves the property in the list but off the map", () => {
    const property = toPublicProperty(record({ locationVisibility: "hidden" }));

    expect(isMappable(property)).toBe(false);
    expect(property.name).toBe("Test concept");
  });
});

describe("manual public marker", () => {
  it("uses the administrator's position instead of the derived one", () => {
    const location = resolvePublicLocation(
      record({
        locationVisibility: "approximate",
        publicMarkerMode: "manual",
        manualLatitude: -37.4995,
        manualLongitude: 144.9563,
      }),
    );

    expect(location.publicLatitude).toBe(-37.4995);
    expect(location.publicLongitude).toBe(144.9563);
    expect(location.markerMode).toBe("manual");
  });

  it("falls back to the derived position when the manual one is unusable", () => {
    const location = resolvePublicLocation(
      record({
        locationVisibility: "suburb",
        publicMarkerMode: "manual",
        manualLatitude: Number.NaN,
        manualLongitude: 999,
      }),
    );

    expect(location.publicLatitude).toBe(
      getSuburbReference("Craigieburn")?.latitude,
    );
  });

  it("does not change the stored position", () => {
    const source = record({
      locationVisibility: "exact",
      publicMarkerMode: "manual",
      manualLatitude: -37.4,
      manualLongitude: 144.8,
    });

    resolvePublicLocation(source);

    expect(source.privateLatitude).toBe(EXACT_LATITUDE);
    expect(source.privateLongitude).toBe(EXACT_LONGITUDE);
  });
});

describe("address visibility", () => {
  const address = {
    houseNumber: "27",
    street: "Example Street",
    postcode: "3064",
  };

  function format(visibility: AddressVisibility): string | null {
    return formatPublicAddress("Craigieburn", "VIC", address, visibility);
  }

  it("supports every documented combination", () => {
    expect(
      format({
        houseNumber: true,
        street: true,
        suburb: true,
        postcode: true,
      }),
    ).toBe("27 Example Street, Craigieburn VIC 3064");

    expect(
      format({
        houseNumber: false,
        street: true,
        suburb: false,
        postcode: false,
      }),
    ).toBe("Example Street");

    expect(
      format({
        houseNumber: false,
        street: false,
        suburb: true,
        postcode: false,
      }),
    ).toBe("Craigieburn VIC");

    expect(
      format({
        houseNumber: false,
        street: false,
        suburb: true,
        postcode: true,
      }),
    ).toBe("Craigieburn VIC 3064");

    expect(
      format({
        houseNumber: false,
        street: false,
        suburb: false,
        postcode: false,
      }),
    ).toBeNull();
  });

  it("never publishes a house number without its street", () => {
    expect(
      format({
        houseNumber: true,
        street: false,
        suburb: true,
        postcode: false,
      }),
    ).toBe("Craigieburn VIC");
  });

  it("omits parts the record does not have", () => {
    expect(
      formatPublicAddress(
        "Craigieburn",
        "VIC",
        { postcode: "3064" },
        { houseNumber: true, street: true, suburb: true, postcode: true },
      ),
    ).toBe("Craigieburn VIC 3064");
  });

  it("matches every admin preset", () => {
    for (const preset of addressVisibilityPresets) {
      const formatted = format(preset.value);

      if (preset.label === "No address") {
        expect(formatted).toBeNull();
      } else {
        expect(formatted).toBeTruthy();
      }
    }
  });
});

describe("directions visibility", () => {
  it("is offered when allowed and there is a marker", () => {
    expect(
      resolvePublicLocation(
        record({ locationVisibility: "exact", allowDirections: true }),
      ).allowDirections,
    ).toBe(true);
  });

  it("is withheld when the property forbids it", () => {
    expect(
      resolvePublicLocation(
        record({ locationVisibility: "exact", allowDirections: false }),
      ).allowDirections,
    ).toBe(false);
  });

  it("is withheld when there is no marker to navigate to", () => {
    expect(
      resolvePublicLocation(
        record({ locationVisibility: "hidden", allowDirections: true }),
      ).allowDirections,
    ).toBe(false);
  });
});

describe("independence from status", () => {
  const statuses: PropertyStatus[] = [
    "move-in-ready",
    "under-construction",
    "completed",
    "sold",
  ];

  it("gives the same location for every status when settings match", () => {
    const locations = statuses.map((status) =>
      resolvePublicLocation(record({ locationVisibility: "exact" }, { status })),
    );

    for (const location of locations) {
      expect(location.publicLatitude).toBe(EXACT_LATITUDE);
      expect(location.visibility).toBe("exact");
    }
  });

  it("hides a home for sale and reveals a sold one when told to", () => {
    const hiddenAvailable = resolvePublicLocation(
      record({ locationVisibility: "hidden" }, { status: "move-in-ready" }),
    );
    const exactSold = resolvePublicLocation(
      record({ locationVisibility: "exact" }, { status: "sold" }),
    );

    expect(hiddenAvailable.publicLatitude).toBeUndefined();
    expect(exactSold.publicLatitude).toBe(EXACT_LATITUDE);
  });
});

describe("toPublicProperty", () => {
  it("omits private fields entirely rather than blanking them", () => {
    const property = toPublicProperty(record({ locationVisibility: "exact" }));
    const keys = Object.keys(property);

    expect(keys).not.toContain("privateLatitude");
    expect(keys).not.toContain("privateLongitude");
    expect(keys).not.toContain("privacy");
    expect(keys).not.toContain("address");
  });

  it("serialises without any trace of the privacy settings", () => {
    const serialised = JSON.stringify(
      toPublicProperty(
        record({
          locationVisibility: "approximate",
          privacyRadiusMeters: 1000,
        }),
      ),
    );

    expect(serialised).not.toContain("privateLatitude");
    expect(serialised).not.toContain("privacy");
    expect(serialised).not.toContain("Example Street");
    expect(serialised).not.toContain(String(EXACT_LATITUDE));
    expect(serialised).not.toContain(String(EXACT_LONGITUDE));
  });

  it("drops an unusable stored position instead of publishing a broken pin", () => {
    const property = toPublicProperty(
      record({ locationVisibility: "exact" }, {
        privateLatitude: Number.NaN,
        privateLongitude: 1000,
      }),
    );

    expect(isMappable(property)).toBe(false);
  });
});

describe("privacy option metadata", () => {
  it("offers the documented radii with readable labels", () => {
    expect(privacyRadiusOptions).toEqual([100, 250, 500, 1000, 2000, 5000]);
    expect(privacyRadiusLabel(500)).toBe("500 m");
    expect(privacyRadiusLabel(2000)).toBe("2 km");
  });

  it("validates values arriving from a form or a database", () => {
    expect(isPrivacyRadius(500)).toBe(true);
    expect(isPrivacyRadius(750)).toBe(false);
    expect(isPrivacyRadius("500")).toBe(false);
    expect(isLocationVisibility("suburb")).toBe(true);
    expect(isLocationVisibility("street")).toBe(false);
  });
});
