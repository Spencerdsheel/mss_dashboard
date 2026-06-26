import { getSettingsData } from "./actions";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const data = await getSettingsData();

  return <SettingsClient siteTitle={data.siteTitle} />;
}