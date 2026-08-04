import { describe, expect, it } from "vitest";

import {
  IMAGE_MIME_TYPES,
  MEDIA_CATEGORIES,
  STORAGE_PATH_PATTERN,
  buildStoragePath,
  categoryForImageType,
  extensionMatchesMimeType,
  formatFileSize,
  isDocumentMimeType,
  isImageMimeType,
  isValidStoragePath,
  parseStoragePath,
  sizeLimitFor,
  storageExtensionForMimeType,
  type ImageType,
} from "@/lib/media/config";

/**
 * Storage path rules.
 *
 * These matter more than most validation: the path is what the database's
 * `is_valid_property_media_path()` accepts or refuses, and the two regexes
 * have to agree. A path this module builds and the storage policy rejects
 * means uploads fail; a path this module accepts and the policy would have
 * refused means a record pointing at an object that was never written.
 */

const PROPERTY = "0192f3c1-6a2b-4d5e-8f70-1a2b3c4d5e6f";
const OTHER_PROPERTY = "0192f3c1-6a2b-4d5e-8f70-aaaabbbbcccc";
const OBJECT = "abcdef01-2345-6789-abcd-ef0123456789";

describe("buildStoragePath", () => {
  it("builds a path the pattern accepts", () => {
    const path = buildStoragePath(PROPERTY, "gallery", "image/jpeg", () => OBJECT);

    expect(path).toBe(`properties/${PROPERTY}/gallery/${OBJECT}.jpg`);
    expect(isValidStoragePath(path as string)).toBe(true);
  });

  it("derives the extension from the MIME type, never the filename", () => {
    // This is what stops `invoice.php.jpg` reaching the bucket with its
    // original name, and what guarantees the result matches the pattern.
    expect(buildStoragePath(PROPERTY, "gallery", "image/png", () => OBJECT)).toBe(
      `properties/${PROPERTY}/gallery/${OBJECT}.png`,
    );
    expect(buildStoragePath(PROPERTY, "gallery", "image/webp", () => OBJECT)).toBe(
      `properties/${PROPERTY}/gallery/${OBJECT}.webp`,
    );
    expect(
      buildStoragePath(PROPERTY, "documents", "application/pdf", () => OBJECT),
    ).toBe(`properties/${PROPERTY}/documents/${OBJECT}.pdf`);
  });

  it("refuses a MIME type it has no extension for", () => {
    expect(
      buildStoragePath(PROPERTY, "gallery", "image/svg+xml", () => OBJECT),
    ).toBeNull();
    expect(
      buildStoragePath(PROPERTY, "gallery", "application/zip", () => OBJECT),
    ).toBeNull();
  });

  it("refuses a property id that is not a UUID", () => {
    // A non-UUID id would produce a path the storage policy rejects. Failing
    // here turns that into a clear error rather than an opaque upload denial.
    expect(
      buildStoragePath("not-a-uuid", "gallery", "image/jpeg", () => OBJECT),
    ).toBeNull();
    expect(
      buildStoragePath("../etc", "gallery", "image/jpeg", () => OBJECT),
    ).toBeNull();
  });

  it("produces a distinct path each time by default", () => {
    const first = buildStoragePath(PROPERTY, "gallery", "image/jpeg");
    const second = buildStoragePath(PROPERTY, "gallery", "image/jpeg");

    expect(first).not.toBe(second);
  });

  it("covers every category", () => {
    for (const category of MEDIA_CATEGORIES) {
      const mime = category === "documents" ? "application/pdf" : "image/jpeg";
      const path = buildStoragePath(PROPERTY, category, mime, () => OBJECT);

      expect(path, category).not.toBeNull();
      expect(isValidStoragePath(path as string), category).toBe(true);
    }
  });
});

describe("parseStoragePath", () => {
  it("decomposes a valid path", () => {
    const parsed = parseStoragePath(
      `properties/${PROPERTY}/floor-plans/${OBJECT}.png`,
    );

    expect(parsed).toEqual({
      propertyId: PROPERTY,
      category: "floor-plans",
      objectId: OBJECT,
      extension: "png",
    });
  });

  it("lowercases so comparisons are reliable", () => {
    const parsed = parseStoragePath(
      `properties/${PROPERTY.toUpperCase()}/GALLERY/${OBJECT.toUpperCase()}.JPG`,
    );

    expect(parsed?.propertyId).toBe(PROPERTY);
    expect(parsed?.category).toBe("gallery");
    expect(parsed?.extension).toBe("jpg");
  });

  /* --- Path escape --------------------------------------------------- */

  it("cannot be escaped by traversal sequences", () => {
    // Traversal is prevented by the grammar rather than by stripping
    // characters: '..' is not a UUID, so none of these can match.
    const attempts = [
      "properties/../../etc/passwd",
      `properties/${PROPERTY}/../${OTHER_PROPERTY}/gallery/${OBJECT}.jpg`,
      `properties/${PROPERTY}/gallery/../../../${OBJECT}.jpg`,
      `properties/${PROPERTY}/gallery/..%2F${OBJECT}.jpg`,
      `../properties/${PROPERTY}/gallery/${OBJECT}.jpg`,
      `/properties/${PROPERTY}/gallery/${OBJECT}.jpg`,
      `properties/${PROPERTY}/gallery/${OBJECT}.jpg/../../x.jpg`,
    ];

    for (const attempt of attempts) {
      expect(parseStoragePath(attempt), attempt).toBeNull();
    }
  });

  it("rejects a category outside the allowed set", () => {
    expect(
      parseStoragePath(`properties/${PROPERTY}/secrets/${OBJECT}.jpg`),
    ).toBeNull();
    expect(
      parseStoragePath(`properties/${PROPERTY}/private/${OBJECT}.jpg`),
    ).toBeNull();
  });

  it("rejects a filename that is not a bare UUID", () => {
    // Original filenames are refused: they collide, they can carry double
    // extensions, and they can describe the property.
    const attempts = [
      `properties/${PROPERTY}/gallery/kitchen.jpg`,
      `properties/${PROPERTY}/gallery/${OBJECT}.php.jpg`,
      `properties/${PROPERTY}/gallery/${OBJECT}`,
      `properties/${PROPERTY}/gallery/${OBJECT}.`,
      `properties/${PROPERTY}/gallery/${OBJECT}.jpeg2000`,
    ];

    for (const attempt of attempts) {
      expect(parseStoragePath(attempt), attempt).toBeNull();
    }
  });

  it("rejects extra or missing path segments", () => {
    expect(parseStoragePath(`properties/${PROPERTY}/${OBJECT}.jpg`)).toBeNull();
    expect(
      parseStoragePath(`properties/${PROPERTY}/gallery/sub/${OBJECT}.jpg`),
    ).toBeNull();
    expect(parseStoragePath(`${PROPERTY}/gallery/${OBJECT}.jpg`)).toBeNull();
    expect(parseStoragePath("")).toBeNull();
  });

  it("rejects a wrong root", () => {
    expect(
      parseStoragePath(`property/${PROPERTY}/gallery/${OBJECT}.jpg`),
    ).toBeNull();
    expect(
      parseStoragePath(`uploads/${PROPERTY}/gallery/${OBJECT}.jpg`),
    ).toBeNull();
  });
});

/**
 * The TypeScript pattern must accept exactly what the SQL function accepts.
 *
 * The cases below are the ones worth pinning: if migration 0009's regex is
 * ever edited, these are what should be re-checked against it. Verifying the
 * agreement for real needs a database, which is noted as a limitation rather
 * than asserted here.
 */
describe("STORAGE_PATH_PATTERN mirrors the SQL validator", () => {
  const accepted = [
    `properties/${PROPERTY}/hero/${OBJECT}.jpg`,
    `properties/${PROPERTY}/gallery/${OBJECT}.png`,
    `properties/${PROPERTY}/facade/${OBJECT}.webp`,
    `properties/${PROPERTY}/construction/${OBJECT}.jpg`,
    `properties/${PROPERTY}/floor-plans/${OBJECT}.png`,
    `properties/${PROPERTY}/drone/${OBJECT}.jpg`,
    `properties/${PROPERTY}/documents/${OBJECT}.pdf`,
  ];

  const refused = [
    `properties/${PROPERTY}/façade/${OBJECT}.jpg`, // non-ASCII folder
    `properties/${PROPERTY}/floor_plan/${OBJECT}.jpg`, // column value, not folder
    `properties/${PROPERTY}/gallery/${OBJECT}.svg`.replace(".svg", ".s"), // 1-char ext
    `properties/${PROPERTY}/gallery/${OBJECT}.toolongext`,
  ];

  it("accepts every documented layout", () => {
    for (const path of accepted) {
      expect(STORAGE_PATH_PATTERN.test(path), path).toBe(true);
    }
  });

  it("refuses near-misses", () => {
    for (const path of refused) {
      expect(STORAGE_PATH_PATTERN.test(path), path).toBe(false);
    }
  });
});

describe("categoryForImageType", () => {
  it("maps the column value to its folder", () => {
    // The two spellings differ on purpose: `floor_plan` is a column value,
    // `floor-plans` is a directory.
    expect(categoryForImageType("floor_plan")).toBe("floor-plans");
    expect(categoryForImageType("gallery")).toBe("gallery");
    expect(categoryForImageType("facade")).toBe("facade");
    expect(categoryForImageType("hero")).toBe("hero");
    expect(categoryForImageType("construction")).toBe("construction");
    expect(categoryForImageType("drone")).toBe("drone");
  });

  it("gives every image type a folder inside the allowed set", () => {
    const types: ImageType[] = [
      "hero",
      "gallery",
      "facade",
      "construction",
      "floor_plan",
      "drone",
    ];

    for (const type of types) {
      expect(MEDIA_CATEGORIES, type).toContain(categoryForImageType(type));
    }
  });
});

describe("accepted formats", () => {
  it("accepts the three browser-safe image formats", () => {
    expect(IMAGE_MIME_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });

  it("refuses SVG", () => {
    // An SVG can carry script and would be served from our own origin.
    expect(isImageMimeType("image/svg+xml")).toBe(false);
    expect(storageExtensionForMimeType("image/svg+xml")).toBeNull();
  });

  it("refuses AVIF until the rendering pipeline is confirmed", () => {
    expect(isImageMimeType("image/avif")).toBe(false);
  });

  it("refuses formats that are not images at all", () => {
    for (const mime of [
      "text/html",
      "application/javascript",
      "application/zip",
      "image/gif",
      "",
    ]) {
      expect(isImageMimeType(mime), mime).toBe(false);
    }
  });

  it("accepts PDF as the only document format", () => {
    expect(isDocumentMimeType("application/pdf")).toBe(true);
    expect(isDocumentMimeType("application/msword")).toBe(false);
    expect(isDocumentMimeType("text/plain")).toBe(false);
  });
});

describe("extensionMatchesMimeType", () => {
  it("accepts both spellings of a JPEG", () => {
    expect(extensionMatchesMimeType("kitchen.jpg", "image/jpeg")).toBe(true);
    expect(extensionMatchesMimeType("kitchen.jpeg", "image/jpeg")).toBe(true);
    expect(extensionMatchesMimeType("KITCHEN.JPG", "image/jpeg")).toBe(true);
  });

  it("rejects a mismatch between name and contents", () => {
    expect(extensionMatchesMimeType("kitchen.png", "image/jpeg")).toBe(false);
    expect(extensionMatchesMimeType("brochure.jpg", "application/pdf")).toBe(false);
    expect(extensionMatchesMimeType("script.php", "image/jpeg")).toBe(false);
  });

  it("uses the last extension, so a double extension cannot hide one", () => {
    // `payload.jpg.php` reported as an image is refused, because the effective
    // extension is the last one.
    expect(extensionMatchesMimeType("payload.jpg.php", "image/jpeg")).toBe(false);
    // The reverse is genuinely a JPEG and is allowed.
    expect(extensionMatchesMimeType("payload.php.jpg", "image/jpeg")).toBe(true);
  });

  it("rejects a filename with no extension", () => {
    expect(extensionMatchesMimeType("kitchen", "image/jpeg")).toBe(false);
    expect(extensionMatchesMimeType("kitchen.", "image/jpeg")).toBe(false);
  });

  it("rejects an unknown MIME type outright", () => {
    expect(extensionMatchesMimeType("a.svg", "image/svg+xml")).toBe(false);
  });
});

describe("sizeLimitFor", () => {
  it("allows floor plans and documents more room than photographs", () => {
    // A floor plan is a more detailed file than a photograph, and a brochure
    // more again.
    expect(sizeLimitFor("gallery")).toBeLessThan(sizeLimitFor("floor-plans"));
    expect(sizeLimitFor("floor-plans")).toBeLessThan(sizeLimitFor("documents"));
  });

  it("stays inside Supabase's default object limit", () => {
    for (const category of MEDIA_CATEGORIES) {
      expect(sizeLimitFor(category), category).toBeLessThanOrEqual(
        50 * 1024 * 1024,
      );
    }
  });
});

describe("formatFileSize", () => {
  it("scales the unit to the size", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatFileSize(15 * 1024 * 1024)).toBe("15 MB");
  });

  it("does not pretend to know an unusable size", () => {
    expect(formatFileSize(Number.NaN)).toBe("unknown size");
    expect(formatFileSize(-1)).toBe("unknown size");
  });
});
