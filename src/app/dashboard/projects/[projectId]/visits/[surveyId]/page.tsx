import Link from "next/link";
import { notFound } from "next/navigation";
import { assertProjectAccess } from "@/server/rbac";
import { getDashboardProvider } from "@/server/providers";
import { cookies } from "next/headers";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhotoGallery } from "./photo-gallery";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Store,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  Camera,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; surveyId: string }>;
}) {
  const { projectId, surveyId } = await params;
  await assertProjectAccess(projectId);
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  const provider = getDashboardProvider("rest-api", token, projectId);
  const [visit, allVisits] = await Promise.all([
    provider.getVisit(surveyId),
    provider.listVisits(),
  ]);

  if (!visit) notFound();

  const currentIdx = allVisits.findIndex((v) => v.surveyId === surveyId);
  const prevVisit = currentIdx > 0 ? allVisits[currentIdx - 1] : null;
  const nextVisit = currentIdx < allVisits.length - 1 ? allVisits[currentIdx + 1] : null;

  const photoSlots = [
    { label: "Storefront", kind: "STOREFRONT", url: visit.storefrontUrl },
    { label: "P1", kind: "PHOTO_1", url: visit.photo1 },
    { label: "P2", kind: "PHOTO_2", url: visit.photo2 },
    { label: "P3", kind: "PHOTO_3", url: visit.photo3 },
    { label: "P4", kind: "PHOTO_4", url: visit.photo4 },
    { label: "P5", kind: "PHOTO_5", url: visit.photo5 },
    { label: "P6", kind: "PHOTO_6", url: visit.photo6 },
    { label: "P7", kind: "PHOTO_7", url: visit.photo7 },
    { label: "P8", kind: "PHOTO_8", url: visit.photo8 },
    { label: "P9", kind: "PHOTO_9", url: visit.photo9 },
  ];

  const filledCount = photoSlots.filter((p) => !!p.url).length;
  const installs = [
    { label: "Install 1", value: visit.install1 },
    { label: "Install 2", value: visit.install2 },
    { label: "Install 3", value: visit.install3 },
    ...(visit.install4 ? [{ label: "Install 4", value: visit.install4 }] : []),
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden gap-3">
      {/* Top bar: back + survey ID + prev/next nav */}
      <div className="flex items-center justify-between shrink-0">
        <Link
          href={`/dashboard/projects/${projectId}/visits`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Visit List
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            Survey {visit.surveyId}
          </Badge>
          <div className="flex items-center gap-1">
            {prevVisit ? (
              <Link
                href={`/dashboard/projects/${projectId}/visits/${prevVisit.surveyId}`}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Previous visit"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="rounded-md p-1 text-muted-foreground/30">
                <ArrowLeft className="h-3.5 w-3.5" />
              </span>
            )}
            {nextVisit ? (
              <Link
                href={`/dashboard/projects/${projectId}/visits/${nextVisit.surveyId}`}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Next visit"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="rounded-md p-1 text-muted-foreground/30">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main content: Store panel (col 1-4) + Photo grid (col 5-12) */}
      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0 overflow-hidden">
        {/* Store panel */}
        <div className="col-span-4 flex flex-col gap-3 min-h-0 overflow-y-auto">
          <div className="card-ventriloc shrink-0">
            <CardHeader className="px-3 py-2.5 space-y-0">
              <CardTitle className="font-space-grotesk text-lg text-foreground" style={{ letterSpacing: "-0.02em" }}>
                {visit.storeName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 px-3 pb-3 text-sm">
              <InfoRow icon={<Store className="h-3.5 w-3.5" />} label="Store ID" value={visit.storeId} />
              {visit.address && (
                <InfoRow
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Address"
                  value={`${visit.address}${visit.city ? `, ${visit.city}` : ""}`}
                />
              )}
              <InfoRow
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Visit Date"
                value={`${formatDate(visit.visitDate)}${visit.visitTime ? ` · ${visit.visitTime}` : ""}`}
              />
              {visit.clerkName && (
                <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Clerk" value={visit.clerkName} />
              )}
            </CardContent>
          </div>

          <div className="card-ventriloc shrink-0">
            <CardHeader className="px-3 py-2.5 space-y-0">
              <CardTitle className="text-xs font-medium text-foreground">Install Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-3 pb-3">
              {installs.map((inst) => (
                <StatusRow key={inst.label} label={inst.label} value={inst.value} />
              ))}
            </CardContent>
          </div>

          {visit.overallNotes && (
            <div className="card-ventriloc shrink-0">
              <CardHeader className="px-3 py-2.5 space-y-0">
                <CardTitle className="text-xs font-medium text-foreground">Notes</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {visit.overallNotes}
                </p>
              </CardContent>
            </div>
          )}

          {/* Completeness rail */}
          <div className="card-ventriloc shrink-0">
            <CardHeader className="px-3 py-2.5 space-y-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5 text-[#ff682c]" />
                  Completeness
                </CardTitle>
                <span className="text-[10px] tabular-nums text-muted-foreground">{filledCount}/10</span>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="flex items-center gap-1.5">
                {photoSlots.map((slot) => (
                  <div
                    key={slot.kind}
                    className={`h-2.5 flex-1 rounded-full transition-colors ${
                      slot.url ? "bg-[#ff682c]" : "bg-muted"
                    }`}
                    title={`${slot.label}: ${slot.url ? "Has photo" : "Empty"}`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[9px] text-muted-foreground">SF</span>
                <span className="text-[9px] text-muted-foreground">P9</span>
              </div>
            </CardContent>
          </div>
        </div>

        {/* Photo grid 5x2 */}
        <div className="col-span-8 card-ventriloc flex flex-col min-h-0 p-3">
          <div className="flex items-center justify-between shrink-0 mb-2">
            <span className="text-sm font-medium text-foreground">Photo Evidence</span>
            <Badge variant={filledCount === 0 ? "destructive" : "secondary"} className="text-[10px]">
              {filledCount === 0 ? "No photos" : `${filledCount} / 10`}
            </Badge>
          </div>
          <div className="flex-1 min-h-0">
            <PhotoGallery photos={photoSlots} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xs font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string | null }) {
  const isNegative = value?.toLowerCase().includes("refused") || value?.toLowerCase().includes("closed");
  const isPositive = value && !isNegative && !value.toLowerCase().includes("not targeted");
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {value ? (
          isPositive ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          ) : isNegative ? (
            <XCircle className="h-3 w-3 text-destructive" />
          ) : null
        ) : null}
        <Badge
          variant={
            !value ? "outline" : isNegative ? "destructive" : isPositive ? ("success" as any) : "outline"
          }
          className="max-w-[180px] truncate text-[10px]"
        >
          {value ?? "—"}
        </Badge>
      </div>
    </div>
  );
}
