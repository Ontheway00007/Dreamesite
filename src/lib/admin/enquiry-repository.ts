import "server-only";

import { logAdminError } from "@/lib/admin/errors";
import { buildSearchFilter } from "@/lib/admin/search";
import {
  ENQUIRY_STATUSES,
  looksLikeSpam,
  type EnquiryStatus,
} from "@/lib/admin/validation/enquiry";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EnquiriesRow } from "@/types/database";

/**
 * Admin enquiry reads.
 *
 * `enquiries` has no anonymous SELECT policy, so every read here depends on an
 * active administrator session. The table holds names, email addresses, phone
 * numbers and free text written by members of the public: it is the most
 * sensitive data in the system, and it exists in exactly one repository so
 * there is one place to audit for how it is reached.
 */

export interface AdminEnquiry {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly message: string;
  readonly source: string;
  readonly consentToContact: boolean;
  readonly status: EnquiryStatus;
  readonly adminNotes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** The property asked about, when the enquiry came from a property page. */
  readonly property: { readonly id: string; readonly name: string } | null;
  /**
   * Derived on read, never stored. See `looksLikeSpam` — a submitter inserts as
   * `anon` and must not get a say in how their own message is classified.
   */
  readonly suspectedSpam: boolean;
}

export interface AdminEnquiryListResult {
  readonly enquiries: readonly AdminEnquiry[];
  readonly total: number;
  readonly failed: boolean;
}

export interface EnquiryListParams {
  readonly page?: number;
  readonly perPage?: number;
  readonly search?: string;
  /** A status, or "all". */
  readonly status?: string;
  /** A property id, "none" for enquiries with no property, or "all". */
  readonly propertyId?: string;
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

/**
 * Columns the search box matches.
 *
 * The message is included deliberately: staff searching "Donnybrook" expect to
 * find the enquiry that mentions it, and this table exists to be read by them.
 * Terms are escaped and quoted first — see `lib/admin/search.ts`.
 */
const SEARCHABLE_COLUMNS = ["name", "email", "message"] as const;

const LIST_SELECT = `
  id, name, email, phone, message, source, consent_to_contact, status,
  admin_notes, created_at, updated_at,
  property:properties(id, name)
`;

type EnquiryJoinedRow = EnquiriesRow & {
  property: { id: string; name: string } | null;
};

function toEnquiry(row: EnquiryJoinedRow): AdminEnquiry {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    source: row.source,
    consentToContact: row.consent_to_contact,
    status: row.status,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    property: row.property ?? null,
    suspectedSpam: looksLikeSpam(row.message),
  };
}

/**
 * One page of enquiries, newest first.
 *
 * Newest first without an option to reverse it: an enquiry list is a queue, and
 * the oldest unanswered enquiry is reached through the status filter rather than
 * by sorting the whole table backwards.
 */
export async function getAdminEnquiries(
  params: EnquiryListParams = {},
): Promise<AdminEnquiryListResult> {
  const supabase = await createAdminClient();

  const page = Math.max(1, Math.floor(params.page ?? 1));
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Math.floor(params.perPage ?? DEFAULT_PER_PAGE)),
  );
  const offset = (page - 1) * perPage;

  let query = supabase.from("enquiries").select(LIST_SELECT, { count: "exact" });

  const searchFilter = buildSearchFilter(params.search, SEARCHABLE_COLUMNS);

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  if (params.status && params.status !== "all") {
    // Compared against the vocabulary rather than passed through: an unknown
    // value would otherwise silently return nothing.
    if ((ENQUIRY_STATUSES as readonly string[]).includes(params.status)) {
      query = query.eq("status", params.status);
    }
  }

  if (params.propertyId === "none") {
    query = query.is("property_id", null);
  } else if (params.propertyId && params.propertyId !== "all") {
    query = query.eq("property_id", params.propertyId);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  if (error) {
    // The message would carry the search term, which may be someone's email
    // address, so only the operation is named.
    logAdminError("Loading enquiries", error);
    return { enquiries: [], total: 0, failed: true };
  }

  const rows = (data ?? []) as unknown as EnquiryJoinedRow[];

  return {
    enquiries: rows.map(toEnquiry),
    total: count ?? 0,
    failed: false,
  };
}

/**
 * How many enquiries are still unread.
 *
 * Its own function because the sidebar renders on every admin page and needs
 * one integer. `head: true` sends no rows at all — the count arrives in the
 * `Content-Range` header — so nobody's personal data crosses the wire to draw a
 * badge. Returns null on failure, so the badge is omitted rather than showing a
 * confident zero.
 */
export async function getNewEnquiryCount(): Promise<number | null> {
  const supabase = await createAdminClient();

  const { count, error } = await supabase
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  if (error) {
    logAdminError("Counting new enquiries", error);
    return null;
  }

  return count ?? 0;
}

export type EnquiryCounts = Readonly<Record<EnquiryStatus | "all", number>>;

/**
 * How many enquiries sit in each status.
 *
 * Five `head: true` counts rather than reading the rows and counting them in
 * JavaScript: the answer is five integers, and fetching thousands of names and
 * messages to derive them would be both slower and an unnecessary handling of
 * personal data.
 */
export async function getEnquiryCounts(): Promise<EnquiryCounts> {
  const supabase = await createAdminClient();

  const empty: EnquiryCounts = {
    all: 0,
    new: 0,
    read: 0,
    replied: 0,
    archived: 0,
  };

  const [total, ...byStatus] = await Promise.all([
    supabase.from("enquiries").select("id", { count: "exact", head: true }),
    ...ENQUIRY_STATUSES.map((status) =>
      supabase
        .from("enquiries")
        .select("id", { count: "exact", head: true })
        .eq("status", status),
    ),
  ]);

  if (total.error) {
    logAdminError("Counting enquiries", total.error);
    return empty;
  }

  const counts: Record<string, number> = { all: total.count ?? 0 };

  ENQUIRY_STATUSES.forEach((status, index) => {
    counts[status] = byStatus[index]?.count ?? 0;
  });

  return counts as EnquiryCounts;
}

/**
 * Properties available in the enquiry filter.
 *
 * Every property, not only those with enquiries: PostgREST cannot return a
 * distinct set of joined parents in one request, and "filter by a property that
 * turns out to have none" is a clearer outcome than a list that changes shape
 * as enquiries arrive.
 */
export async function getEnquiryPropertyOptions(): Promise<
  ReadonlyArray<{ readonly id: string; readonly name: string }>
> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("properties")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    logAdminError("Loading properties for the enquiry filter", error);
    return [];
  }

  return (data ?? []) as unknown as ReadonlyArray<{ id: string; name: string }>;
}
