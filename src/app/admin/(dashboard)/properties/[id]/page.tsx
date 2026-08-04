import { notFound } from "next/navigation";

import { getAdminPropertyById } from "@/lib/admin/repository";
import { PropertyEditor } from "@/components/admin/property-editor";

export const metadata = { title: "Edit Property" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPropertyPage({ params }: Props) {
  const { id } = await params;
  const data = await getAdminPropertyById(id);

  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-heading-2 font-display text-foreground">
        Edit Property
      </h1>
      <PropertyEditor
        mode="edit"
        propertyId={id}
        initialData={data.property}
        privateLocation={data.privateLocation}
        locationSettings={data.locationSettings}
      />
    </div>
  );
}
