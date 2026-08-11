"use client";

import { usePathname, useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PillNav } from "@/components/ui/pill-nav";
import type { Role } from "@/types/role";

interface ProjectHeaderProps {
  project: {
    id: string;
    name: string;
    clientName: string;
    startDate: string | Date;
    endDate: string | Date;
  };
  role?: Role;
}

function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function ProjectHeader({ project, role }: ProjectHeaderProps) {
  const params = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const base = `/dashboard/projects/${params.projectId}`;

  const navItems = [
    { label: "Overview", href: base, exact: true },
    { label: "Locations", href: `${base}/locations` },
    { label: "Visits", href: `${base}/visits` },
  ];

  const isAdmin = role === "PLATFORM_ADMIN" || role === "CLIENT_ADMIN";

  // Sprint 16 §4.8: "Visit List" (a redundant second link to the same
  // /visits route the "Visits" pill already covers) is removed and replaced
  // with an "Edit dashboard" trigger. Only Overview has an editable
  // WidgetGrid today (13a/13b) — Overview owns its own in-page edit-mode
  // toggle (WidgetEditorToolbar, rendered inside overview-grid.tsx, which
  // this sibling layout-level header has no state channel into). Geography
  // and Visits have no widget grid yet (that's sprint 17, not implemented as
  // of this sprint) — flagged judgment call: since 17 hasn't landed, those
  // two render a disabled/tooltip'd placeholder per the spec's explicit
  // ordering note, rather than building 17's functionality here.
  const isOverview = pathname === base;
  const hasWidgetGrid = isOverview; // true again once sprint 17 lands Geography (+ possibly Visits)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
      <div className="flex items-center gap-3 min-w-0">
        <Badge variant="secondary" className="shrink-0">{project.clientName}</Badge>
        <h1
          className="font-space-grotesk text-2xl font-normal text-foreground truncate"
          style={{ letterSpacing: "-0.04em", lineHeight: 1.1 }}
        >
          {project.name}
        </h1>
        <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
          {fmtDate(project.startDate)} — {fmtDate(project.endDate)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <PillNav items={navItems} />
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            disabled={!hasWidgetGrid}
            title={hasWidgetGrid ? undefined : "Coming with widget-grid support"}
          >
            Edit dashboard
          </Button>
        )}
      </div>
    </div>
  );
}
