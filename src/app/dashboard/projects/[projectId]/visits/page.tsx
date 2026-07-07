import { assertProjectAccess } from "@/server/rbac";
import { getDashboardProvider } from "@/server/providers";
import { getProjectSummary } from "@/server/analytics";
import { cookies } from "next/headers";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VisitsTable, type VisitRow } from "./visits-table";
import { EvidenceStrip } from "@/components/charts/evidence-strip";

export const dynamic = "force-dynamic";

export default async function VisitListPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { session } = await assertProjectAccess(projectId);
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  const provider = getDashboardProvider("rest-api", token, projectId);
  const [visits, summary] = await Promise.all([
    provider.listVisits(),
    getProjectSummary(projectId, token),
  ]);

  const rows: VisitRow[] = visits.map((v) => ({
    id: v.surveyId,
    surveyId: v.surveyId,
    storeId: v.storeId,
    storeName: v.storeName,
    city: v.city,
    address: v.address,
    visitDate: v.visitDate.toISOString(),
    clerkName: v.clerkName,
    install1: v.install1,
    install2: v.install2,
    install3: v.install3,
    photoCount: v.photoCount ?? 0,
  }));

  const cities = Array.from(new Set(rows.map((r) => r.city).filter(Boolean))).sort() as string[];
  const install1Values = Array.from(new Set(rows.map((r) => r.install1).filter(Boolean))).sort() as string[];
  const install2Values = Array.from(new Set(rows.map((r) => r.install2).filter(Boolean))).sort() as string[];
  const install3Values = Array.from(new Set(rows.map((r) => r.install3).filter(Boolean))).sort() as string[];

  return (
    <div className="flex h-full flex-col overflow-hidden gap-3">
      {/* Evidence strip */}
      <EvidenceStrip
        photoByKind={summary.photoByKind}
        totalVisits={summary.totalVisits}
        rowsWithNoPhotos={summary.rowsWithNoPhotos}
      />

      {/* Table card — fills remaining space */}
      <div className="card-ventriloc flex-1 min-h-0 flex flex-col">
        <CardHeader className="space-y-1 shrink-0 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium text-foreground">Visits</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {rows.length.toLocaleString()} records · Click a row to open detail and photos.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-auto px-4 pb-3">
          <VisitsTable
            projectId={projectId}
            rows={rows}
            cities={cities}
            install1Values={install1Values}
            install2Values={install2Values}
            install3Values={install3Values}
          />
        </CardContent>
      </div>
    </div>
  );
}
