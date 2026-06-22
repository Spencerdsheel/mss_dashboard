import { getMetricsData } from "./actions";
import { MetricsClient } from "./metrics-client";

export const dynamic = "force-dynamic";

export default async function AdminMetricsPage() {
  const data = await getMetricsData();

  return (
    <MetricsClient
      tenants={data.tenants}
      projects={data.projects}
      metrics={data.metrics}
      defaultTenantId={data.defaultTenantId}
      defaultProjectId={data.defaultProjectId}
    />
  );
}
