import { getSettingsData } from "./actions";
import { SettingsClient } from "./settings-client";
import { requireSession } from "@/server/rbac";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await requireSession();
  const data = await getSettingsData();

  return (
    <SettingsClient
      settings={data.settings}
      userRole={session.user.role}
    />
  );
}
