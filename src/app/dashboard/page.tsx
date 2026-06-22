import Link from "next/link";
import { listVisibleProjects, requireSession } from "@/server/rbac";
import { AppShell } from "@/components/app-shell";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { StaggerCards, StaggerCard } from "@/components/ui/stagger-cards";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { isProjectActive } from "@/lib/projects";
import type { ProjectListItem } from "@/server/providers/types";

export const dynamic = "force-dynamic";

function ProjectCard({ p }: { p: ProjectListItem }) {
  return (
    <StaggerCard key={p.id}>
      <Link href={`/dashboard/projects/${p.id}`} className="group block h-full">
        <div className="card-ventriloc h-full transition-transform duration-200 hover:-translate-y-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge variant="secondary">{p.clientName}</Badge>
              <ArrowRight className="h-4 w-4 text-slate transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-2 font-space-grotesk text-lg font-medium text-carbon" style={{ letterSpacing: "-0.02em" }}>
              {p.name}
            </div>
            <div className="text-xs text-slate">
              {p.startDate ? formatDate(p.startDate) : "—"} →{" "}
              {p.endDate ? formatDate(p.endDate) : "—"}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate">
                  Visits
                </div>
                <div className="kpi-number">
                  <AnimatedCounter value={p.visitCount ?? 0} />
                </div>
              </div>
              <Badge variant="success">
                {p.visitCount != null ? `${p.visitCount.toLocaleString()} visits` : "Active"}
              </Badge>
            </div>
          </CardContent>
        </div>
      </Link>
    </StaggerCard>
  );
}

export default async function DashboardIndex() {
  const session = await requireSession();
  const projects = await listVisibleProjects();

  const activeProjects = projects.filter(isProjectActive);
  const pastProjects = projects.filter((p) => !isProjectActive(p));

  return (
    <AppShell session={session as any}>
      <div className="space-y-8">
        <div>
          <h1 className="font-space-grotesk text-3xl font-normal tracking-tight text-carbon" style={{ letterSpacing: "-0.04em" }}>
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate">
            Select a project to view execution metrics.
          </p>
        </div>

        {projects.length === 0 && (
          <div className="card-ventriloc p-10 text-center text-sm text-slate">
            No projects available for this account.
          </div>
        )}

        {activeProjects.length > 0 && (
          <section>
            <h2 className="mb-3 font-space-grotesk text-sm font-medium uppercase tracking-widest text-slate">
              Active
            </h2>
            <StaggerCards>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {activeProjects.map((p) => (
                  <ProjectCard key={p.id} p={p} />
                ))}
              </div>
            </StaggerCards>
          </section>
        )}

        {pastProjects.length > 0 && (
          <section>
            <h2 className="mb-3 font-space-grotesk text-sm font-medium uppercase tracking-widest text-slate">
              Past / Upcoming
            </h2>
            <StaggerCards>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pastProjects.map((p) => (
                  <ProjectCard key={p.id} p={p} />
                ))}
              </div>
            </StaggerCards>
          </section>
        )}
      </div>
    </AppShell>
  );
}
