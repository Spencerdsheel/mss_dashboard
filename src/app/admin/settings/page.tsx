import { getSettingsData } from "./actions";
import { SettingsClient } from "./settings-client";
import { requireAdmin } from "@/server/rbac";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const data = await getSettingsData();

  return <SettingsClient siteTitle={data.siteTitle} />;
}