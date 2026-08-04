export const metadata = { title: "Enquiries" };

export default function EnquiriesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-heading-2 font-display text-foreground">Enquiries</h1>
      <div className="bg-surface border-border rounded-xl border p-8 text-center">
        <p className="text-foreground-muted">
          Enquiry management is ready for implementation. The database and RLS
          policies are configured — this page will be built in a future phase.
        </p>
      </div>
    </div>
  );
}
