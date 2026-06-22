import { getPhotoSlotsData } from "./actions";
import { PhotoSlotsClient } from "./photo-slots-client";

export const dynamic = "force-dynamic";

export default async function AdminPhotoSlotsPage() {
  const data = await getPhotoSlotsData();

  return (
    <PhotoSlotsClient
      tenants={data.tenants}
      projects={data.projects}
      photoSlots={data.photoSlots}
      defaultTenantId={data.defaultTenantId}
      defaultProjectId={data.defaultProjectId}
    />
  );
}
