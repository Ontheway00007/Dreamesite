"use client";

import { useState, useTransition } from "react";

import {
  saveLocationAction,
  type LocationFormData,
} from "@/lib/admin/actions/location-actions";
import type { FieldError } from "@/lib/admin/validation/result";
import type {
  PropertyLocationSettingsRow,
  PropertyPrivateLocationsRow,
} from "@/types/database";
import { AdminAlert } from "@/components/admin/admin-alert";
import { Checkbox, Field } from "@/components/admin/form-controls";
import type {
  LocationVisibility,
  PrivacyRadiusMeters,
  PublicMarkerMode,
} from "@/types";

interface Props {
  propertyId?: string;
  privateLocation?: PropertyPrivateLocationsRow;
  locationSettings?: PropertyLocationSettingsRow;
  /** Called after a successful save so the parent can refresh readiness. */
  onSaved?: () => void;
}

const RADIUS_OPTIONS: ReadonlyArray<{ value: PrivacyRadiusMeters; label: string }> = [
  { value: 100, label: "100 m" },
  { value: 250, label: "250 m" },
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: 5000, label: "5 km" },
];

function toFieldMap(errors: readonly FieldError[] | undefined) {
  if (!errors) return {};

  return errors.reduce<Record<string, string>>((map, error) => {
    if (!map[error.field]) map[error.field] = error.message;
    return map;
  }, {});
}

export function LocationEditor({
  propertyId,
  privateLocation,
  locationSettings,
  onSaved,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Stored position. Left empty rather than defaulted to a plausible-looking
  // coordinate — a pre-filled position an administrator forgets to change
  // would publish a marker for the wrong place.
  const [latitude, setLatitude] = useState<string>(
    privateLocation ? String(privateLocation.private_latitude) : "",
  );
  const [longitude, setLongitude] = useState<string>(
    privateLocation ? String(privateLocation.private_longitude) : "",
  );
  const [houseNumber, setHouseNumber] = useState(
    privateLocation?.house_number ?? "",
  );
  const [street, setStreet] = useState(privateLocation?.street ?? "");
  const [postcode, setPostcode] = useState(privateLocation?.postcode ?? "");

  // Privacy configuration
  const [visibility, setVisibility] = useState<LocationVisibility>(
    (locationSettings?.location_visibility as LocationVisibility) ?? "suburb",
  );
  const [radius, setRadius] = useState<PrivacyRadiusMeters>(
    (locationSettings?.privacy_radius_meters as PrivacyRadiusMeters) ?? 500,
  );
  const [markerMode, setMarkerMode] = useState<PublicMarkerMode>(
    (locationSettings?.public_marker_mode as PublicMarkerMode) ?? "automatic",
  );
  const [manualLatitude, setManualLatitude] = useState<string>(
    locationSettings?.manual_public_latitude != null
      ? String(locationSettings.manual_public_latitude)
      : "",
  );
  const [manualLongitude, setManualLongitude] = useState<string>(
    locationSettings?.manual_public_longitude != null
      ? String(locationSettings.manual_public_longitude)
      : "",
  );
  const [showHouseNumber, setShowHouseNumber] = useState(
    locationSettings?.show_house_number ?? false,
  );
  const [showStreet, setShowStreet] = useState(
    locationSettings?.show_street ?? false,
  );
  const [showSuburb, setShowSuburb] = useState(
    locationSettings?.show_suburb ?? true,
  );
  const [showPostcode, setShowPostcode] = useState(
    locationSettings?.show_postcode ?? true,
  );
  const [allowDirections, setAllowDirections] = useState<boolean | undefined>(
    locationSettings?.allow_directions ?? undefined,
  );

  // A location belongs to a property row. Until one exists there is nothing
  // to attach it to, and the save would fail on a foreign key — so the form
  // is not offered at all.
  if (!propertyId) {
    return (
      <AdminAlert tone="info" title="Save the property first">
        <p className="mt-1">
          A location is stored against a saved property. Create the property on
          the Details tab, then set its location here.
        </p>
      </AdminAlert>
    );
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    setFieldErrors({});

    const parseCoordinate = (value: string): number =>
      value.trim() === "" ? Number.NaN : Number(value);

    const payload: LocationFormData = {
      privateLatitude: parseCoordinate(latitude),
      privateLongitude: parseCoordinate(longitude),
      houseNumber: houseNumber || undefined,
      street: street || undefined,
      postcode: postcode || undefined,
      locationVisibility: visibility,
      privacyRadiusMeters: radius,
      publicMarkerMode: markerMode,
      manualPublicLatitude:
        manualLatitude.trim() === "" ? undefined : Number(manualLatitude),
      manualPublicLongitude:
        manualLongitude.trim() === "" ? undefined : Number(manualLongitude),
      showHouseNumber,
      showStreet,
      showSuburb,
      showPostcode,
      allowDirections,
    };

    startTransition(async () => {
      const result = await saveLocationAction(propertyId as string, payload);

      if (result.success) {
        setSaved(true);
        onSaved?.();
        return;
      }

      setError(result.error ?? "Could not save the location.");
      setFieldErrors(toFieldMap(result.fieldErrors));
    });
  }

  return (
    <div className="space-y-6">
      {error && <AdminAlert tone="error" title={error} />}
      {saved && (
        <AdminAlert tone="success" title="Location saved">
          <p className="mt-1">
            The public marker has been regenerated from these settings.
          </p>
        </AdminAlert>
      )}

      {/* Stored position */}
      <section className="bg-surface border-border space-y-4 rounded-xl border p-6">
        <header>
          <h3 className="text-foreground text-sm font-semibold uppercase tracking-wider">
            Stored position
          </h3>
          <p className="text-foreground-subtle mt-1 text-xs">
            Never published as-is. The privacy settings below decide what a
            visitor actually sees.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latitude" required error={fieldErrors.privateLatitude}>
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              className="admin-input"
              placeholder="-37.5312"
            />
          </Field>
          <Field label="Longitude" required error={fieldErrors.privateLongitude}>
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              className="admin-input"
              placeholder="144.8861"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="House number">
            <input
              type="text"
              value={houseNumber}
              onChange={(event) => setHouseNumber(event.target.value)}
              className="admin-input"
            />
          </Field>
          <Field label="Street">
            <input
              type="text"
              value={street}
              onChange={(event) => setStreet(event.target.value)}
              className="admin-input"
            />
          </Field>
          <Field label="Postcode" error={fieldErrors.postcode}>
            <input
              type="text"
              inputMode="numeric"
              value={postcode}
              onChange={(event) => setPostcode(event.target.value)}
              className="admin-input"
              placeholder="3064"
            />
          </Field>
        </div>
      </section>

      {/* Privacy */}
      <section className="bg-surface border-border space-y-4 rounded-xl border p-6">
        <header>
          <h3 className="text-foreground text-sm font-semibold uppercase tracking-wider">
            Privacy
          </h3>
          <p className="text-foreground-subtle mt-1 text-xs">
            Independent of status. A sold home can be shown exactly, and a home
            for sale can be hidden.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Marker precision" required error={fieldErrors.locationVisibility}>
            <select
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as LocationVisibility)
              }
              className="admin-input"
            >
              <option value="exact">Exact — the stored position</option>
              <option value="approximate">Approximate — generalised</option>
              <option value="suburb">Suburb only — the suburb centre</option>
              <option value="hidden">Hidden — no marker</option>
            </select>
          </Field>

          {visibility === "approximate" && (
            <Field
              label="Privacy radius"
              required
              error={fieldErrors.privacyRadiusMeters}
              hint="Never shown to visitors."
            >
              <select
                value={radius}
                onChange={(event) =>
                  setRadius(Number(event.target.value) as PrivacyRadiusMeters)
                }
                className="admin-input"
              >
                {RADIUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {visibility !== "hidden" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Marker placement" error={fieldErrors.publicMarkerMode}>
              <select
                value={markerMode}
                onChange={(event) =>
                  setMarkerMode(event.target.value as PublicMarkerMode)
                }
                className="admin-input"
              >
                <option value="automatic">Automatic — from the rules above</option>
                <option value="manual">Manual — placed by hand</option>
              </select>
            </Field>

            {markerMode === "manual" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Marker latitude" required error={fieldErrors.manualPublicLatitude}>
                  <input
                    type="number"
                    step="any"
                    value={manualLatitude}
                    onChange={(event) => setManualLatitude(event.target.value)}
                    className="admin-input"
                  />
                </Field>
                <Field label="Marker longitude" required error={fieldErrors.manualPublicLongitude}>
                  <input
                    type="number"
                    step="any"
                    value={manualLongitude}
                    onChange={(event) => setManualLongitude(event.target.value)}
                    className="admin-input"
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="text-foreground-muted text-sm font-medium">
            Address shown publicly
          </legend>
          <div className="flex flex-wrap gap-4">
            <Checkbox
              label="House number"
              checked={showHouseNumber}
              onChange={setShowHouseNumber}
            />
            <Checkbox label="Street" checked={showStreet} onChange={setShowStreet} />
            <Checkbox label="Suburb" checked={showSuburb} onChange={setShowSuburb} />
            <Checkbox
              label="Postcode"
              checked={showPostcode}
              onChange={setShowPostcode}
            />
          </div>
          <p className="text-foreground-subtle text-xs">
            A house number is never published without its street.
          </p>
        </fieldset>

        <Field
          label="Directions"
          hint="Default allows directions only for an exact marker."
        >
          <select
            value={allowDirections === undefined ? "default" : String(allowDirections)}
            onChange={(event) => {
              const next = event.target.value;
              setAllowDirections(next === "default" ? undefined : next === "true");
            }}
            className="admin-input"
          >
            <option value="default">Use the default for this precision</option>
            <option value="true">Always offer directions</option>
            <option value="false">Never offer directions</option>
          </select>
        </Field>
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save location"}
      </button>

      <p className="text-foreground-subtle text-xs">
        Saving rewrites the published marker in a single transaction — the
        stored position and what visitors see can never disagree.
      </p>
    </div>
  );
}
