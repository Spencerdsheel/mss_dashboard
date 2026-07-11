import { assertProjectAccess } from "@/server/rbac";
import { getDashboardProvider } from "@/server/providers";
import { getProjectSummary } from "@/server/analytics";
import { cookies } from "next/headers";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VisitsTable } from "./visits-table";
import { EvidenceStrip } from "@/components/charts/evidence-strip";
import type { VisitFilters } from "@/server/providers/rest-api-provider";

export const dynamic = "force-dynamic";

type SearchParams = {
  cursor?: string;
  limit?: string;
  sort?: string;
  dir?: string;
  search?: string;
  city?: string;
  install1?: string;
  install2?: string;
  install3?: string;
};

export default async function VisitListPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  await assertProjectAccess(projectId);
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  const provider = getDashboardProvider("rest-api", token, projectId);

  const filters: VisitFilters = {};
  if (sp.city) filters.city = sp.city;
  if (sp.install1) filters.install1 = sp.install1;
  if (sp.install2) filters.install2 = sp.install2;
  if (sp.install3) filters.install3 = sp.install3;

  const limit = Math.min(Math.max(Number(sp.limit) || 25, 10), 100);
  const sort = sp.sort || "visit_date";
  const dir = sp.dir === "asc" ? "asc" : "desc";

  const [paginatedResult, summary] = await Promise.all([
    provider.listVisitsPaginated({
      cursor: sp.cursor,
      limit,
      sort,
      dir,
      search: sp.search,
      filters,
    }),
    getProjectSummary(projectId, token),
  ]);

  return (
    <div className="flex h-full flex-col overflow-hidden gap-3">
      <EvidenceStrip
        photoByKind={summary.photoByKind}
        totalVisits={summary.totalVisits}
        rowsWithNoPhotos={summary.rowsWithNoPhotos}
      />
      <div className="card-ventriloc flex-1 min-h-0 flex flex-col">
        <CardHeader className="space-y-1 shrink-0 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium text-foreground">Visits</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {paginatedResult.total_count.toLocaleString()} records
                {" "}
                · Click a row to open detail and photos.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-auto px-4 pb-3">
          <VisitsTable
            projectId={projectId}
            items={paginatedResult.items}
            totalCount={paginatedResult.total_count}
            nextCursor={paginatedResult.next_cursor}
            prevCursor={paginatedResult.prev_cursor}
            filterOptions={paginatedResult.filter_options}
            currentSort={sort}
            currentDir={dir}
            currentSearch={sp.search || ""}
            currentFilters={filters}
            currentLimit={limit}
          />
        </CardContent>
      </div>
    </div>
  );
}
