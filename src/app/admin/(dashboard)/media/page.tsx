export const metadata = { title: "Media Library" };

export default function MediaPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-heading-2 font-display text-foreground">Media Library</h1>
      <div className="bg-surface border-border rounded-xl border p-8 text-center">
        <p className="text-foreground-muted">
          Media is managed per property. Use the property editor to upload and
          organise images, documents, and resources.
        </p>
      </div>
    </div>
  );
}
