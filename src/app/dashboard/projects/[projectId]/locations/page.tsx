import { assertProjectAccess } from "@/server/rbac";
import { getProjectSummary, getDashboardLayout } from "@/server/analytics";
import { getDashboardProvider } from "@/server/providers";
import { LocationsGrid } from "./locations-grid";

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { session } = await assertProjectAccess(projectId);
  const token = session.user.accessToken;

  const [summary, dashboardLayout] = await Promise.all([getProjectSummary(projectId, token), getDashboardLayout(projectId, token, "locations")]);
  const provider = getDashboardProvider("rest-api", token, projectId);
  await provider.describeProject();

  const rawVisits = await provider.listVisits();

  const cityCounts = new Map<string, number>();
  for (const v of rawVisits) {
    if (!v.city) continue;
    const city = v.city.trim();
    if (!city) continue;
    cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
  }

  const locationData = Array.from(cityCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([city, count]) => ({ city, count }));

  const visitsWithCity = Array.from(cityCounts.values()).reduce((a, b) => a + b, 0);

  return (
    <LocationsGrid
      projectId={projectId}
      locationData={locationData}
      totalVisits={summary.totalVisits}
      visitsWithCity={visitsWithCity}
      layout={dashboardLayout.layout}
      role={session.user.role}
    />
  );
}
