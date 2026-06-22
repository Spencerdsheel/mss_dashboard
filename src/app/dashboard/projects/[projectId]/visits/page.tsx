import { assertProjectAccess } from "@/server/rbac";
import { getDashboardProvider } from "@/server/providers";
import { cookies } from "next/headers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VisitsTable, type VisitRow } from "./visits-table";

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
  const visits = await provider.listVisits();

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
    <div className="space-y-6">
      <div>
        <h1
          className="font-space-grotesk text-3xl font-normal text-carbon"
          style={{ letterSpacing: "-0.04em" }}
        >
          Visit List
        </h1>
        <p className="mt-1 text-sm text-slate">
          All visits — filter by Standee Messi, Flying Fish, Stock, date, city, and store.
        </p>
      </div>
      <div className="card-ventriloc">
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm font-medium text-carbon">Visits</CardTitle>
          <CardDescription className="text-xs text-slate">
            {rows.length.toLocaleString()} records · Click a row to open the detail and photo gallery.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
