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
 *
 * ## Checked by CI, not by memory
 *
 * Hand-maintained types are only as good as the last person to remember to
 * update them, so this file is not trusted — it is verified. The `database` job
 * in `.github/workflows/ci.yml` applies every migration to an empty PostgreSQL,
 * regenerates types from the result and compares them to this file with
 * `scripts/compare-database-types.mjs`. A column added to a migration and not
 * added here fails the build, in either direction, along with any nullability
 * disagreement or any function declared here that no longer exists.
 *
 * At the time of writing all 15 tables, 177 columns, the one view and all 21
 * declared functions match. Run it locally with:
 *
 *   sudo sh supabase/verify/gen-types.sh /tmp/generated.ts
 *   node scripts/compare-database-types.mjs /tmp/generated.ts src/types/database.ts
 *
 * The generated output was *not* adopted as a replacement, for two reasons.
 * It comes from a cluster whose `auth` and `storage` schemas are the stubs in
 * `00_supabase_stubs.sql` rather than the real platform ones, so it would be
 * regenerated — and would churn — the moment a real project exists. And
 * swapping a file that twenty modules import, in a phase whose whole purpose is
 * hardening, is the riskiest change available for the smallest benefit. Adopt it
 * when `supabase gen types --local` can run against the real stack.
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
  /* SEO overrides, added by migration 0010. Null means "fall back" — see
     lib/seo/metadata.ts for the three-level resolution chain. */
  seo_meta_title: string | null;
  seo_meta_description: string | null;
  seo_og_image_id: string | null;
  seo_canonical_url: string | null;
  seo_noindex: boolean;
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
  /**
   * Set when a property field the projection derives from changed after this
   * row was generated. Added by 0012; cleared by saving the location again.
   */
  stale_since: string | null;
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
  /**
   * 'façade' is the legacy non-ASCII value migration 0009 rewrote to
   * 'facade'. It remains in the union so rows read from a database that has
   * not yet had 0009 applied still type-check; nothing writes it.
   */
  image_type:
    | "hero"
    | "gallery"
    | "facade"
    | "façade"
    | "construction"
    | "floor_plan"
    | "drone";
  storage_path: string | null;
  external_url: string | null;
  alt_text: string | null;
  caption: string | null;
  sort_order: number;
  is_published: boolean;
  /* Added by migration 0009. Null for rows created before it, and for
     externally hosted images we did not receive a file for. */
  original_filename: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
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
  /* Added by migration 0009. */
  caption: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
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
  /** Staff-facing notes. Added by migration 0010. Never published. */
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Typed site configuration. Exactly one row, enforced by the boolean primary
 * key. Administrator-only — the public site reads `site_settings_public`.
 */
export interface SiteSettingsRow {
  id: boolean;
  company_name: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_address_display: string | null;
  default_meta_title: string | null;
  default_meta_description: string | null;
  default_og_image_url: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  social_linkedin: string | null;
  /**
   * Where enquiry notifications should go. Deliberately absent from
   * `SiteSettingsPublicRow` — publishing it would attract spam.
   */
  enquiry_recipient_email: string | null;
  maintenance_notice: string | null;
  updated_at: string;
}

/**
 * The public projection of site settings.
 *
 * Mirrors the `site_settings_public` view. Adding a field here means adding it
 * to the view, which publishes it — treat this list as the decision about what
 * is public.
 */
export type SiteSettingsPublicRow = Omit<
  SiteSettingsRow,
  "id" | "enquiry_recipient_email" | "updated_at"
>;

/**
 * PostgREST embedding shape used by the repositories: a property row with
 * its related rows joined in one query, exactly the names `?select=` returns.
 */
export interface PropertyJoinedRow extends PropertiesRow {
  /**
   * A single object, not an array — `property_id` is this table's primary key
   * as well as its foreign key, so PostgREST treats the relationship as
   * one-to-one and answers with `{...}`. The array form is kept in the union
   * because the fixtures and unit tests build rows by hand.
   */
  property_public_locations:
    | PropertyPublicLocationsRow
    | PropertyPublicLocationsRow[]
    | null;
  property_images: PropertyImagesRow[] | null;
  property_resources: PropertyResourcesRow[] | null;
  property_testimonials: PropertyTestimonialsRow[] | null;
  construction_updates: ConstructionUpdatesRow[] | null;
  property_features: PropertyFeaturesRow[] | null;
}

/**
 * One recorded login attempt. Mirrors `admin_login_attempts` from 0013.
 *
 * Never contains a password, a token or a raw client address.
 */
export interface AdminLoginAttemptsRow {
  id: string;
  email: string;
  /** Salted SHA-256 of the client address, or null when no salt is configured. */
  ip_hash: string | null;
  succeeded: boolean;
  reason:
    | "bad_credentials"
    | "not_admin"
    | "inactive_admin"
    | "throttled"
    | "captcha_failed"
    | "service_error"
    | null;
  created_at: string;
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
      admin_login_attempts: {
        Row: AdminLoginAttemptsRow;
        Insert: Partial<AdminLoginAttemptsRow>;
        Update: Partial<AdminLoginAttemptsRow>;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: Partial<AuditLogRow>;
        Update: Partial<AuditLogRow>;
        Relationships: [];
      };
      site_settings: {
        Row: SiteSettingsRow;
        Insert: Partial<SiteSettingsRow>;
        Update: Partial<SiteSettingsRow>;
        Relationships: [];
      };
    };
    Views: {
      /** Public-safe subset of site_settings. Readable by anon. */
      site_settings_public: {
        Row: SiteSettingsPublicRow;
        Relationships: [];
      };
    };
    Functions: {
      /** Records one login attempt. Callable by anon. Added by 0013. */
      record_login_attempt: {
        Args: {
          p_email: string;
          p_ip_hash: string | null;
          p_succeeded: boolean;
          p_reason: string | null;
        };
        Returns: void;
      };
      /** Whether a login attempt may proceed. Added by 0013. */
      check_login_throttle: {
        Args: { p_email: string; p_ip_hash: string | null };
        Returns: Array<{
          allowed: boolean;
          requires_captcha: boolean;
          retry_after_seconds: number;
          recent_failures: number;
        }>;
      };
      /** Deletes old login attempts. Administrator-only. Added by 0013. */
      purge_login_attempts: {
        Args: { p_older_than_days: number };
        Returns: number;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      /**
       * Atomic location save. Writes the private position, the privacy
       * settings, the derived public projection and the audit entry in one
       * transaction. See migration 0008.
       */
      /** Rewrites only the public projection, version-checked. Added by 0012. */
      save_regenerated_public_location: {
        Args: {
          p_property_id: string;
          p_expected_property_updated_at: string | null;
          p_expected_private_updated_at: string | null;
          p_expected_settings_updated_at: string | null;
          p_location_visibility: string;
          p_public_latitude: number | null;
          p_public_longitude: number | null;
          p_public_address: string | null;
          p_marker_mode: string;
          p_location_label: string | null;
          p_accuracy_note: string | null;
          p_allow_directions: boolean;
        };
        Returns: void;
      };
      /** Ordered-group advisory lock. Admin-only. Added by 0012. */
      lock_group: {
        Args: { p_class: string; p_property_id: string; p_group: string };
        Returns: void;
      };
      save_property_location: {
        Args: {
          p_property_id: string;
          /** Optimistic concurrency, added by 0012. Null skips the check. */
          p_expected_property_updated_at: string | null;
          p_private_latitude: number;
          p_private_longitude: number;
          p_house_number: string | null;
          p_street: string | null;
          p_postcode: string | null;
          p_location_visibility: string;
          p_privacy_radius_meters: number | null;
          p_public_marker_mode: string;
          p_manual_public_latitude: number | null;
          p_manual_public_longitude: number | null;
          p_suburb_reference: string | null;
          p_show_house_number: boolean;
          p_show_street: boolean;
          p_show_suburb: boolean;
          p_show_postcode: boolean;
          p_allow_directions: boolean | null;
          p_public_latitude: number | null;
          p_public_longitude: number | null;
          p_public_address: string | null;
          p_marker_mode: string;
          p_location_label: string | null;
          p_accuracy_note: string | null;
          p_public_allow_directions: boolean;
        };
        Returns: void;
      };
      /** Reasons a property cannot be published yet. Empty means ready. */
      property_publish_blockers: {
        Args: { p_property_id: string };
        Returns: string[];
      };
      /**
       * Promotes one image to hero and demotes the previous one, atomically.
       * See migration 0009.
       */
      set_property_hero_image: {
        Args: { p_property_id: string; p_image_id: string };
        Returns: void;
      };
      /** Rewrites sort_order across one image group in a single statement. */
      reorder_property_images: {
        Args: {
          p_property_id: string;
          p_image_type: string;
          p_image_ids: string[];
        };
        Returns: void;
      };
      /** Rewrites sort_order across one resource group in a single statement. */
      reorder_property_resources: {
        Args: {
          p_property_id: string;
          p_resource_type: string;
          p_resource_ids: string[];
        };
        Returns: void;
      };
      /** True when a storage object name matches the required media layout. */
      is_valid_property_media_path: {
        Args: { object_name: string };
        Returns: boolean;
      };
      /**
       * Publishes a property only if it has no blockers, checking and updating
       * under one row lock. Returns the blockers when it refuses; an empty
       * array means it published. See migration 0010.
       */
      /** Advisory-lock helpers added by 0011. */
      property_lock_key: {
        Args: { p_property_id: string };
        Returns: number;
      };
      lock_property: {
        Args: { p_property_id: string };
        Returns: void;
      };
      lock_admin_roster: {
        Args: Record<string, never>;
        Returns: void;
      };
      /** Removes a property's location and unpublishes it. Added by 0011. */
      clear_property_location: {
        Args: { p_property_id: string };
        Returns: void;
      };
      /**
       * Draft properties with at least one publish blocker. Shares its
       * definition with the publish gate. Added by 0011.
       */
      count_publish_blocked_properties: {
        Args: Record<string, never>;
        Returns: number;
      };
      publish_property_if_ready: {
        Args: { p_property_id: string };
        Returns: string[];
      };
      /** Rewrites sort_order across one property's construction updates. */
      reorder_construction_updates: {
        Args: { p_property_id: string; p_update_ids: string[] };
        Returns: void;
      };
      /** Rewrites sort_order across one feature category. */
      reorder_property_features: {
        Args: {
          p_property_id: string;
          p_category: string;
          p_feature_ids: string[];
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
