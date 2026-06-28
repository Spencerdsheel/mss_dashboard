import Link from "next/link";
import { assertProjectAccess } from "@/server/rbac";
import { getProjectSummary } from "@/server/analytics";
import { getDashboardProvider } from "@/server/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatPct, cn } from "@/lib/utils";
import { ArrowRight, Target, Camera, Store, Calendar } from "lucide-react";
import { ChartsSection } from "./charts-section";
import { StaggerCards, StaggerCard } from "@/components/ui/stagger-cards";
import { AnimatedCounter } from "@/components/ui/animated-counter";

export const dynamic = "force-dynamic";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { session, project } = await assertProjectAccess(projectId);
  const token = session.user.accessToken;

  const summary = await getProjectSummary(projectId, token);
  const provider = getDashboardProvider("rest-api", token, projectId);
  await provider.describeProject();

  // Fetch visits for client-side chart computation — slim serializable rows only
  const rawVisits = await provider.listVisits();
  const visitRows = rawVisits.map((v) => ({
    visitDate: v.visitDate.toISOString(),
    city: v.city,
    install1: v.install1,
    install2: v.install2,
    install3: v.install3,
  }));

  // P1.4: KPI cards use first two install slots (if available)
  const slot1 = summary.installSlots[0];
  const slot2 = summary.installSlots[1];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{project.clientName}</Badge>
            <Badge variant="info">Project Overview</Badge>
          </div>
          <h1
            className="mt-2 font-space-grotesk text-4xl font-normal text-carbon"
            style={{ letterSpacing: "-0.04em", lineHeight: 1.1 }}
          >
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-slate">
            {project.startDate ? formatDate(project.startDate) : ""} —{" "}
            {project.endDate ? formatDate(project.endDate) : ""} · Retail execution / planogram compliance
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/projects/${project.id}/visits`}>
            <Button variant="brand">
              Visit List <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <StaggerCards>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StaggerCard>
            <Kpi
              icon={<Store className="h-4 w-4" />}
              label="Total Visits"
              value={summary.totalVisits}
              sub={`${summary.uniqueStores.toLocaleString()} unique stores`}
            />
          </StaggerCard>
          <StaggerCard>
            <Kpi
              icon={<Calendar className="h-4 w-4" />}
              label="Execution Period"
              value={null}
              displayValue={
                summary.minDate && summary.maxDate
                  ? `${formatDate(summary.minDate)} → ${formatDate(summary.maxDate)}`
                  : "—"
              }
              sub={`${daysBetween(summary.minDate, summary.maxDate)} days covered`}
            />
          </StaggerCard>
          {slot1 && (
            <StaggerCard>
              <Kpi
                icon={<Target className="h-4 w-4" />}
                label={slot1.title}
                value={slot1.success_count}
                sub={`${formatPct(slot1.success_count, summary.totalVisits)} of visits`}
                progress={summary.totalVisits ? slot1.success_count / summary.totalVisits : 0}
              />
            </StaggerCard>
          )}
          {slot2 && (
            <StaggerCard>
              <Kpi
                icon={<Target className="h-4 w-4" />}
                label={slot2.title}
                value={slot2.success_count}
                sub={`${formatPct(slot2.success_count, summary.totalVisits)} of visits`}
                progress={summary.totalVisits ? slot2.success_count / summary.totalVisits : 0}
              />
            </StaggerCard>
          )}
        </div>
      </StaggerCards>

      {/* Charts */}
      <ChartsSection
        totalVisits={summary.totalVisits}
        installSlots={summary.installSlots}
        photoByKind={summary.photoByKind}
        rowsWithNoPhotos={summary.rowsWithNoPhotos}
        metrics={summary.metrics}
        visitRows={visitRows}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  displayValue,
  sub,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  displayValue?: string;
  sub?: string;
  progress?: number;
}) {
  return (
    <div className="card-ventriloc p-5 flex flex-col justify-between min-h-[140px]">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate">
        <span>{label}</span>
        <span className="text-signal-orange">{icon}</span>
      </div>
      <div className={cn(
        "mt-3",
        value !== null
          ? "kpi-number"
          : "font-space-grotesk text-base font-medium text-carbon"
      )} style={value !== null ? undefined : { letterSpacing: "-0.02em" }}>
        {value !== null ? <AnimatedCounter value={value} /> : displayValue}
      </div>
      {sub && <div className="mt-1 text-xs text-slate">{sub}</div>}
      {typeof progress === "number" && (
        <div className="mt-4 h-0.5 w-full overflow-hidden rounded-full bg-chalk">
          <div
            className="h-full rounded-full bg-signal-orange transition-all duration-700"
            style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function daysBetween(a: string | null, b: string | null) {
  if (!a || !b) return 0;
  return (
    Math.round(
      (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1
  );
}
