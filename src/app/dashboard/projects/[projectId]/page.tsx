import { assertProjectAccess } from "@/server/rbac";
import { getProjectSummary } from "@/server/analytics";
import { getDashboardProvider } from "@/server/providers";
import { OverviewGrid } from "./overview-grid";

export const dynamic = "force-dynamic";

export default async function ProjectOverviewPage({
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
  const visitRows = rawVisits.map((v) => ({
    visitDate: v.visitDate.toISOString(),
    city: v.city,
    install1: v.install1,
    install2: v.install2,
    install3: v.install3,
    visitTime: v.visitTime,
    storeName: v.storeName,
    photoCount: [v.storefrontUrl, v.photo1, v.photo2, v.photo3, v.photo4,
                 v.photo5, v.photo6, v.photo7, v.photo8, v.photo9].filter(Boolean).length,
  }));

  const dailyVisits = Object.values(
    visitRows.reduce((acc, v) => {
      const day = v.visitDate.slice(0, 10);
      acc[day] = (acc[day] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  );

  return (
    <OverviewGrid
      projectId={projectId}
      totalVisits={summary.totalVisits}
      uniqueStores={summary.uniqueStores}
      minDate={summary.minDate}
      maxDate={summary.maxDate}
      installSlots={summary.installSlots}
      metrics={summary.metrics}
      visitRows={visitRows}
      dailyVisits={dailyVisits}
    />
  );
}
