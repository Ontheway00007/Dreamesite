import { AdminAlert } from "@/components/admin/admin-alert";
import { EnquiryFiltersBar } from "@/components/admin/enquiries/enquiry-filters-bar";
import { EnquiryList } from "@/components/admin/enquiries/enquiry-list";
import {
  getAdminEnquiries,
  getEnquiryCounts,
  getEnquiryPropertyOptions,
} from "@/lib/admin/enquiry-repository";

export const metadata = { title: "Enquiries" };

const PER_PAGE = 20;

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Reads a single string from a param that may arrive as an array. */
function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

export default async function EnquiriesPage({ searchParams }: Props) {
  const params = await searchParams;

  const pageParam = Number(readParam(params, "page"));
  const page =
    Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  const search = readParam(params, "search") ?? "";
  const status = readParam(params, "status") ?? "all";
  const propertyId = readParam(params, "property") ?? "all";

  // Three independent reads. The counts drive the status tabs and the property
  // list drives its filter, so all three are needed for the first paint.
  const [result, counts, properties] = await Promise.all([
    getAdminEnquiries({ page, perPage: PER_PAGE, search, status, propertyId }),
    getEnquiryCounts(),
    getEnquiryPropertyOptions(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-2 font-display text-foreground">Enquiries</h1>
        <p className="text-foreground-subtle mt-1 text-sm">
          Everything sent through the website. Personal information — treat it
          accordingly.
        </p>
      </div>

      {/* A failed read and an empty queue look identical, so they are
          distinguished rather than both reading as "nothing here". */}
      {result.failed ? (
        <AdminAlert tone="error" title="Could not load enquiries">
          <p className="mt-1">
            The database did not respond. Reload the page to try again — the
            details are in the server logs.
          </p>
        </AdminAlert>
      ) : (
        <>
          <EnquiryFiltersBar
            search={search}
            status={status}
            propertyId={propertyId}
            counts={counts}
            properties={properties}
          />

          <EnquiryList
            enquiries={result.enquiries}
            total={result.total}
            page={page}
            perPage={PER_PAGE}
          />
        </>
      )}
    </div>
  );
}
