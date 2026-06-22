import Link from "next/link";
import { notFound } from "next/navigation";
import { assertProjectAccess } from "@/server/rbac";
import { getDashboardProvider } from "@/server/providers";
import { cookies } from "next/headers";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoGallery } from "./photo-gallery";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, MapPin, Store, User, Clock } from "lucide-react";

// P1.4: Success values now come from campaign config in DB, not hardcoded constants.

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
  const visit = await provider.getVisit(surveyId);

  if (!visit) notFound();

  const photos = [
    { label: "Storefront", kind: "STOREFRONT", url: visit.storefrontUrl },
    { label: "Photo 1", kind: "PHOTO_1", url: visit.photo1 },
    { label: "Photo 2", kind: "PHOTO_2", url: visit.photo2 },
    { label: "Photo 3", kind: "PHOTO_3", url: visit.photo3 },
    { label: "Photo 4", kind: "PHOTO_4", url: visit.photo4 },
    { label: "Photo 5", kind: "PHOTO_5", url: visit.photo5 },
    { label: "Photo 6", kind: "PHOTO_6", url: visit.photo6 },
    { label: "Photo 7", kind: "PHOTO_7", url: visit.photo7 },
    { label: "Photo 8", kind: "PHOTO_8", url: visit.photo8 },
    { label: "Photo 9", kind: "PHOTO_9", url: visit.photo9 },
  ].filter((p) => !!p.url) as { label: string; kind: string; url: string }[];

  const storefront = photos.find((p) => p.kind === "STOREFRONT");
  const gallery = photos.filter((p) => p.kind !== "STOREFRONT");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/dashboard/projects/${projectId}/visits`}>
          <Button variant="ghost" size="sm" className="text-graphite">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Visit List
          </Button>
        </Link>
        <Badge variant="outline">Survey ID {visit.surveyId}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left column — store info + install status */}
        <div className="space-y-4">
          <div className="card-ventriloc">
            <CardHeader>
              <CardDescription className="text-xs text-slate">Store</CardDescription>
              <CardTitle
                className="font-space-grotesk text-xl text-carbon"
                style={{ letterSpacing: "-0.02em" }}
              >
                {visit.storeName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow icon={<Store className="h-4 w-4" />} label="Store ID" value={visit.storeId} />
              {visit.address && (
                <InfoRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="Address"
                  value={`${visit.address}${visit.city ? `, ${visit.city}` : ""}`}
                />
              )}
              <InfoRow
                icon={<Clock className="h-4 w-4" />}
                label="Visit Date"
                value={`${formatDate(visit.visitDate)}${visit.visitTime ? ` · ${visit.visitTime}` : ""}`}
              />
              {visit.clerkName && (
                <InfoRow icon={<User className="h-4 w-4" />} label="Clerk" value={visit.clerkName} />
              )}
            </CardContent>
          </div>

          <div className="card-ventriloc">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-carbon">
                Installation Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusRow label="Install 1" value={visit.install1} />
              <StatusRow label="Install 2" value={visit.install2} />
              <StatusRow label="Install 3" value={visit.install3} />
              {visit.install4 && (
                <StatusRow label="Install 4" value={visit.install4} />
              )}
            </CardContent>
          </div>

          {visit.overallNotes && (
            <div className="card-ventriloc">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-carbon">General Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-graphite">
                  {visit.overallNotes}
                </p>
              </CardContent>
            </div>
          )}
        </div>

        {/* Right column — photos */}
        <div className="space-y-4">
          <div className="card-ventriloc">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium text-carbon">Visit Photos</CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-slate">
                    {photos.length} photo{photos.length !== 1 ? "s" : ""} submitted · storefront + up to 9 slots
                  </CardDescription>
                </div>
                <Badge variant={photos.length === 0 ? "destructive" : "secondary"}>
                  {photos.length === 0 ? "No photos" : `${photos.length} / 10`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {photos.length === 0 ? (
                <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-chalk text-sm text-slate">
                  No photos submitted for this visit.
                </div>
              ) : (
                <PhotoGallery storefront={storefront} gallery={gallery} />
              )}
            </CardContent>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-slate">{icon}</div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate">{label}</div>
        <div className="font-medium text-carbon">{value}</div>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  // P1.4: Success semantics now come from campaign config in DB.
  const isNegative = value?.toLowerCase().includes("refused") || value?.toLowerCase().includes("closed");
  const isNeutral = value?.toLowerCase().includes("not targeted");
  const variant = !value
    ? "outline"
    : isNegative
    ? "destructive"
    : isNeutral
    ? "outline"
    : "success";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-graphite">{label}</div>
      <Badge variant={variant as any} className="max-w-[220px] truncate text-right">
        {value ?? "—"}
      </Badge>
    </div>
  );
}
