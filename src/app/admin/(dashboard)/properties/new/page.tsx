import { PropertyEditor } from "@/components/admin/property-editor";

export const metadata = { title: "New Property" };

export default function NewPropertyPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-heading-2 font-display text-foreground">
        New Property
      </h1>
      <PropertyEditor mode="create" />
    </div>
  );
}
