import { assertProjectAccess } from "@/server/rbac";
import { getProjectSummary } from "@/server/analytics";
import { getDashboardProvider } from "@/server/providers";
import { GeographyGrid } from "./geography-grid";

export const dynamic = "force-dynamic";

export default async function GeographyPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { session } = await assertProjectAccess(projectId);
  const token = session.user.accessToken;

  const summary = await getProjectSummary(projectId, token);
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
    <GeographyGrid
      projectId={projectId}
      locationData={locationData}
      totalVisits={summary.totalVisits}
      visitsWithCity={visitsWithCity}
    />
  );
}
