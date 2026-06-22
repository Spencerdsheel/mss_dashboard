import { getConnectionsData } from "./actions";
import { ConnectionsClient } from "./connections-client";

export const dynamic = "force-dynamic";

export default async function AdminConnectionsPage() {
  const data = await getConnectionsData();

  return (
    <ConnectionsClient
      tenants={data.tenants}
      connections={data.connections}
    />
  );
}
