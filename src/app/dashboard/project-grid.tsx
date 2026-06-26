"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaggerCards, StaggerCard } from "@/components/ui/stagger-cards";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { isProjectActive } from "@/lib/projects";
import { formatDate } from "@/lib/utils";
import type { ProjectListItem } from "@/server/providers/types";

type FilterOption =
  | "all-active"
  | "current-month"
  | "last-month"
  | "last-2-months"
  | "last-3-months"
  | "custom";

interface ProjectGridProps {
  projects: ProjectListItem[];
}

function projectOverlapsPeriod(
  p: ProjectListItem,
  start: Date,
  end: Date
): boolean {
  const pStart = p.startDate ? new Date(p.startDate) : new Date(0);
  const pEnd = p.endDate ? new Date(p.endDate) : new Date("2099-12-31");
  return pStart <= end && pEnd >= start;
}

function getPeriodDates(
  option: FilterOption,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date } | null {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (option) {
    case "current-month":
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0, 23, 59, 59, 999),
      };
    case "last-month": {
      const lastMonth = new Date(year, month - 1, 1);
      return {
        start: lastMonth,
        end: new Date(year, month, 0, 23, 59, 59, 999),
      };
    }
    case "last-2-months": {
      const twoMonthsAgo = new Date(year, month - 2, 1);
      return {
        start: twoMonthsAgo,
        end: new Date(year, month, 0, 23, 59, 59, 999),
      };
    }
    case "last-3-months": {
      const threeMonthsAgo = new Date(year, month - 3, 1);
      return {
        start: threeMonthsAgo,
        end: new Date(year, month, 0, 23, 59, 59, 999),
      };
    }
    case "custom":
      if (customStart && customEnd) {
        return {
          start: new Date(customStart),
          end: new Date(customEnd + "T23:59:59.999"),
        };
      }
      return null;
    default:
      return null;
  }
}

function ProjectCard({ p }: { p: ProjectListItem }) {
  const active = isProjectActive(p);
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
              <Badge variant={active ? "success" : "secondary"}>
                {active ? "Live" : "Completed"}
              </Badge>
            </div>
          </CardContent>
        </div>
      </Link>
    </StaggerCard>
  );
}

export function ProjectGrid({ projects }: ProjectGridProps) {
  const [filter, setFilter] = useState<FilterOption>("all-active");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const filteredProjects = useMemo(() => {
    if (filter === "all-active") {
      return projects.filter(isProjectActive);
    }

    const period = getPeriodDates(filter, customStart, customEnd);
    if (!period) return projects;

    return projects.filter((p) => projectOverlapsPeriod(p, period.start, period.end));
  }, [projects, filter, customStart, customEnd]);

  const activeProjects = filteredProjects.filter(isProjectActive);
  const pastProjects = filteredProjects.filter((p) => !isProjectActive(p));

  const filterOptions: { value: FilterOption; label: string }[] = [
    { value: "all-active", label: "All Active" },
    { value: "current-month", label: "Current Month" },
    { value: "last-month", label: "Last Month" },
    { value: "last-2-months", label: "Last 2 Months" },
    { value: "last-3-months", label: "Last 3 Months" },
    { value: "custom", label: "Custom Range" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-space-grotesk text-3xl font-normal tracking-tight text-carbon" style={{ letterSpacing: "-0.04em" }}>
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate">
          Select a project to view execution metrics.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {filterOptions.map((opt) => (
          <Button
            key={opt.value}
            variant={filter === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(opt.value)}
            className="text-xs"
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Custom range date pickers */}
      {filter === "custom" && (
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <Label htmlFor="custom-start" className="text-xs text-slate">
              Start
            </Label>
            <Input
              id="custom-start"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="custom-end" className="text-xs text-slate">
              End
            </Label>
            <Input
              id="custom-end"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-44"
            />
          </div>
        </div>
      )}

      {filteredProjects.length === 0 && (
        <div className="card-ventriloc p-10 text-center text-sm text-slate">
          No projects match the selected filter.
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
            Ongoing Projects
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
  );
}