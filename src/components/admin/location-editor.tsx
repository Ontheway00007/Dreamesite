"use client";

import { useState, useTransition } from "react";

import {
  saveLocationAction,
  type LocationFormData,
} from "@/lib/admin/actions/location-actions";
import type { PropertyLocationSettingsRow, PropertyPrivateLocationsRow } from "@/types/database";

interface Props {
  propertyId?: string;
  privateLocation?: PropertyPrivateLocationsRow;
  locationSettings?: PropertyLocationSettingsRow;
}

export function LocationEditor({
  propertyId,
  privateLocation,
  locationSettings,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Private location state
  const [latitude, setLatitude] = useState(privateLocation?.private_latitude ?? -37.53);
  const [longitude, setLongitude] = useState(privateLocation?.private_longitude ?? 144.88);
  const [houseNumber, setHouseNumber] = useState(privateLocation?.house_number ?? "");
  const [street, setStreet] = useState(privateLocation?.street ?? "");
  const [postcode, setPostcode] = useState(privateLocation?.postcode ?? "");

  // Privacy settings state
  const [visibility, setVisibility] = useState<string>(locationSettings?.location_visibility ?? "suburb");
  const [radius, setRadius] = useState<number>(locationSettings?.privacy_radius_meters ?? 500);
  const [markerMode, setMarkerMode] = useState<string>(locationSettings?.public_marker_mode ?? "automatic");
  const [manualLat, setManualLat] = useState(locationSettings?.manual_public_latitude ?? undefined);
  const [manualLng, setManualLng] = useState(locationSettings?.manual_public_longitude ?? undefined);
  const [showHouseNumber, setShowHouseNumber] = useState(locationSettings?.show_house_number ?? false);
  const [showStreet, setShowStreet] = useState(locationSettings?.show_street ?? false);
  const [showSuburb, setShowSuburb] = useState(locationSettings?.show_suburb ?? true);
  const [showPostcode, setShowPostcode] = useState(locationSettings?.show_postcode ?? true);
  const [allowDirections, setAllowDirections] = useState<boolean | undefined>(
    locationSettings?.allow_directions ?? undefined,
  );

  if (!propertyId) {
    return (
      <div className="bg-surface border-border rounded-xl border p-6">
        <p className="text-foreground-muted text-sm">
          Save the property first to configure its location and privacy settings.
        </p>
      </div>
    );
  }

  function handleSave() {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const data: LocationFormData = {
        privateLatitude: latitude,
        privateLongitude: longitude,
        houseNumber: houseNumber || undefined,
        street: street || undefined,
        postcode: postcode || undefined,
        locationVisibility: visibility as LocationFormData["locationVisibility"],
        privacyRadiusMeters: radius as LocationFormData["privacyRadiusMeters"],
        publicMarkerMode: markerMode as LocationFormData["publicMarkerMode"],
        manualPublicLatitude: manualLat,
        manualPublicLongitude: manualLng,
        showHouseNumber,
        showStreet,
        showSuburb,
        showPostcode,
        allowDirections: allowDirections ?? undefined,
      };

      const result = await saveLocationAction(propertyId!, data);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error ?? "Failed to save location.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border-red-500/20 rounded-lg border px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border-emerald-500/20 rounded-lg border px-4 py-3 text-sm text-emerald-400">
          Location saved and public projection regenerated.
        </div>
      )}

      {/* Private Coordinates */}
      <div className="bg-surface border-border space-y-4 rounded-xl border p-6">
        <h3 className="text-foreground text-sm font-semibold uppercase tracking-wider">
          Private Coordinates
        </h3>
        <p className="text-foreground-subtle text-xs">
          These are never exposed publicly. The privacy settings below control what visitors see.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-foreground-muted text-sm font-medium">Latitude</label>
            <input type="number" step="any" value={latitude} onChange={(e) => setLatitude(Number(e.target.value))} className="admin-input" />
          </div>
          <div className="space-y-1.5">
            <label className="text-foreground-muted text-sm font-medium">Longitude</label>
            <input type="number" step="any" value={longitude} onChange={(e) => setLongitude(Number(e.target.value))} className="admin-input" />
          </div>
        </div>

        <h4 className="text-foreground-muted mt-4 text-sm font-medium">Address Parts</h4>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-foreground-subtle text-xs">House number</label>
            <input type="text" value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} className="admin-input" />
          </div>
          <div className="space-y-1.5">
            <label className="text-foreground-subtle text-xs">Street</label>
            <input type="text" value={street} onChange={(e) => setStreet(e.target.value)} className="admin-input" />
          </div>
          <div className="space-y-1.5">
            <label className="text-foreground-subtle text-xs">Postcode</label>
            <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} className="admin-input" />
          </div>
        </div>
      </div>

      {/* Privacy Settings */}
      <div className="bg-surface border-border space-y-4 rounded-xl border p-6">
        <h3 className="text-foreground text-sm font-semibold uppercase tracking-wider">
          Privacy Settings
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-foreground-muted text-sm font-medium">Location visibility</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="admin-input">
              <option value="exact">Exact — publish stored position</option>
              <option value="approximate">Approximate — generalised within radius</option>
              <option value="suburb">Suburb only — suburb centre marker</option>
              <option value="hidden">Hidden — no marker at all</option>
            </select>
          </div>

          {visibility === "approximate" && (
            <div className="space-y-1.5">
              <label className="text-foreground-muted text-sm font-medium">Privacy radius</label>
              <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="admin-input">
                <option value={100}>100 m</option>
                <option value={250}>250 m</option>
                <option value={500}>500 m</option>
                <option value={1000}>1 km</option>
                <option value={2000}>2 km</option>
                <option value={5000}>5 km</option>
              </select>
            </div>
          )}
        </div>

        {/* Marker mode */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-foreground-muted text-sm font-medium">Marker mode</label>
            <select value={markerMode} onChange={(e) => setMarkerMode(e.target.value)} className="admin-input">
              <option value="automatic">Automatic — derived from rules</option>
              <option value="manual">Manual — hand-placed position</option>
            </select>
          </div>
          {markerMode === "manual" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-foreground-subtle text-xs">Manual lat</label>
                <input type="number" step="any" value={manualLat ?? ""} onChange={(e) => setManualLat(e.target.value ? Number(e.target.value) : undefined)} className="admin-input" />
              </div>
              <div className="space-y-1.5">
                <label className="text-foreground-subtle text-xs">Manual lng</label>
                <input type="number" step="any" value={manualLng ?? ""} onChange={(e) => setManualLng(e.target.value ? Number(e.target.value) : undefined)} className="admin-input" />
              </div>
            </div>
          )}
        </div>

        {/* Address visibility */}
        <div className="space-y-2">
          <label className="text-foreground-muted text-sm font-medium">Address visibility</label>
          <div className="flex flex-wrap gap-4">
            <ToggleSmall label="House number" checked={showHouseNumber} onChange={setShowHouseNumber} />
            <ToggleSmall label="Street" checked={showStreet} onChange={setShowStreet} />
            <ToggleSmall label="Suburb" checked={showSuburb} onChange={setShowSuburb} />
            <ToggleSmall label="Postcode" checked={showPostcode} onChange={setShowPostcode} />
          </div>
        </div>

        {/* Directions */}
        <div className="space-y-1.5">
          <label className="text-foreground-muted text-sm font-medium">Directions</label>
          <select
            value={allowDirections === undefined ? "default" : String(allowDirections)}
            onChange={(e) => {
              const val = e.target.value;
              setAllowDirections(val === "default" ? undefined : val === "true");
            }}
            className="admin-input"
          >
            <option value="default">Default for visibility</option>
            <option value="true">Always allow</option>
            <option value="false">Never allow</option>
          </select>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={isPending}
        className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save location & regenerate projection"}
      </button>
    </div>
  );
}

function ToggleSmall({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="text-accent border-border h-4 w-4 rounded bg-transparent"
      />
      <span className="text-foreground-muted text-sm">{label}</span>
    </label>
  );
}
