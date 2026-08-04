/**
 * Database row types, matching the migration files in `supabase/migrations`.
 *
 * These are *storage* shapes. UI components never see them — the repository
 * maps them into the public `Property` type before anything leaves the data
 * layer, mirroring how `toPublicProperty` is the only way a local record
 * escapes today.
 *
 * Generated types from the Supabase CLI (`npm run db:types`) replace this
 * file when a real project exists; keeping this hand-written copy means
 * mapping code is typeable without a running database.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** One description block stored in `properties.description_blocks`. */
export interface DescriptionBlockRow {
  readonly id: string;
  readonly text: string;
}

export interface PropertiesRow {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description_blocks: DescriptionBlockRow[] | null;
  description_source: "written" | "ai-assisted" | null;
  status: "move-in-ready" | "under-construction" | "completed" | "sold";
  suburb: string;
  state: string;
  bedrooms: number;
  bathrooms: number;
  car_spaces: number;
  land_size_sqm: number;
  house_size_sqm: number | null;
  price_display: string | null;
  completion_label: string | null;
  is_featured: boolean;
  is_published: boolean;
  display_priority: number;
  display_is_home: boolean;
  display_opening_note: string | null;
  current_stage_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyPrivateLocationsRow {
  property_id: string;
  private_latitude: number;
  private_longitude: number;
  house_number: string | null;
  street: string | null;
  postcode: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyLocationSettingsRow {
  property_id: string;
  location_visibility: "exact" | "approximate" | "suburb" | "hidden";
  privacy_radius_meters: 100 | 250 | 500 | 1000 | 2000 | 5000 | null;
  public_marker_mode: "automatic" | "manual";
  manual_public_latitude: number | null;
  manual_public_longitude: number | null;
  suburb_reference: string | null;
  show_house_number: boolean;
  show_street: boolean;
  show_suburb: boolean;
  show_postcode: boolean;
  allow_directions: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyPublicLocationsRow {
  property_id: string;
  location_visibility: "exact" | "approximate" | "suburb" | "hidden";
  public_latitude: number | null;
  public_longitude: number | null;
  public_address: string | null;
  marker_mode: "automatic" | "manual";
  location_label: string | null;
  accuracy_note: string | null;
  allow_directions: boolean;
  generated_at: string;
}

export interface SuburbReferencesRow {
  id: string;
  suburb: string;
  state: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PropertyImagesRow {
  id: string;
  property_id: string;
  image_type: "hero" | "gallery" | "façade" | "construction" | "floor_plan" | "drone";
  storage_path: string | null;
  external_url: string | null;
  alt_text: string | null;
  caption: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface PropertyFeaturesRow {
  id: string;
  property_id: string;
  category: string;
  label: string;
  value: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConstructionUpdatesRow {
  id: string;
  property_id: string;
  stage: string;
  title: string;
  description: string | null;
  status: "planned" | "in-progress" | "complete";
  progress_value: number | null;
  occurred_at: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface PropertyResourcesRow {
  id: string;
  property_id: string;
  resource_type:
    | "virtual-tour"
    | "video"
    | "drone-footage"
    | "floor-plan"
    | "brochure"
    | "document";
  title: string;
  url: string | null;
  storage_path: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface PropertyTestimonialsRow {
  id: string;
  property_id: string;
  quote: string;
  attribution: string;
  attribution_role: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnquiriesRow {
  id: string;
  property_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  source: string;
  consent_to_contact: boolean;
  status: "new" | "read" | "replied" | "archived";
  created_at: string;
  updated_at: string;
}

/**
 * PostgREST embedding shape used by the repositories: a property row with
 * its related rows joined in one query, exactly the names `?select=` returns.
 */
export interface PropertyJoinedRow extends PropertiesRow {
  property_public_locations: PropertyPublicLocationsRow[] | null;
  property_images: PropertyImagesRow[] | null;
  property_resources: PropertyResourcesRow[] | null;
  property_testimonials: PropertyTestimonialsRow[] | null;
}

export interface AdminUsersRow {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "super_admin";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: "created" | "updated" | "published" | "unpublished" | "deleted" | "archived";
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      properties: {
        Row: PropertiesRow;
        Insert: Partial<PropertiesRow>;
        Update: Partial<PropertiesRow>;
        Relationships: [];
      };
      property_private_locations: {
        Row: PropertyPrivateLocationsRow;
        Insert: Partial<PropertyPrivateLocationsRow>;
        Update: Partial<PropertyPrivateLocationsRow>;
        Relationships: [];
      };
      property_location_settings: {
        Row: PropertyLocationSettingsRow;
        Insert: Partial<PropertyLocationSettingsRow>;
        Update: Partial<PropertyLocationSettingsRow>;
        Relationships: [];
      };
      property_public_locations: {
        Row: PropertyPublicLocationsRow;
        Insert: Partial<PropertyPublicLocationsRow>;
        Update: Partial<PropertyPublicLocationsRow>;
        Relationships: [];
      };
      suburb_references: {
        Row: SuburbReferencesRow;
        Insert: Partial<SuburbReferencesRow>;
        Update: Partial<SuburbReferencesRow>;
        Relationships: [];
      };
      property_images: {
        Row: PropertyImagesRow;
        Insert: Partial<PropertyImagesRow>;
        Update: Partial<PropertyImagesRow>;
        Relationships: [];
      };
      property_features: {
        Row: PropertyFeaturesRow;
        Insert: Partial<PropertyFeaturesRow>;
        Update: Partial<PropertyFeaturesRow>;
        Relationships: [];
      };
      construction_updates: {
        Row: ConstructionUpdatesRow;
        Insert: Partial<ConstructionUpdatesRow>;
        Update: Partial<ConstructionUpdatesRow>;
        Relationships: [];
      };
      property_resources: {
        Row: PropertyResourcesRow;
        Insert: Partial<PropertyResourcesRow>;
        Update: Partial<PropertyResourcesRow>;
        Relationships: [];
      };
      property_testimonials: {
        Row: PropertyTestimonialsRow;
        Insert: Partial<PropertyTestimonialsRow>;
        Update: Partial<PropertyTestimonialsRow>;
        Relationships: [];
      };
      enquiries: {
        Row: EnquiriesRow;
        Insert: Partial<EnquiriesRow>;
        Update: Partial<EnquiriesRow>;
        Relationships: [];
      };
      admin_users: {
        Row: AdminUsersRow;
        Insert: Partial<AdminUsersRow>;
        Update: Partial<AdminUsersRow>;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: Partial<AuditLogRow>;
        Update: Partial<AuditLogRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
