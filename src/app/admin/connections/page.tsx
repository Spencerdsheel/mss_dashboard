import { getConnectionsData } from "./actions";
import { ConnectionsClient } from "./connections-client";
import { requireAdmin } from "@/server/rbac";

export const dynamic = "force-dynamic";

export default async function AdminConnectionsPage() {
  await requireAdmin();
  const data = await getConnectionsData();

  return (
    <ConnectionsClient
      tenants={data.tenants}
      connections={data.connections}
    />
  );
}
