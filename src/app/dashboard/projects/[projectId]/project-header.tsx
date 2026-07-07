"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PillNav } from "@/components/ui/pill-nav";
import { ArrowRight } from "lucide-react";

interface ProjectHeaderProps {
  project: {
    id: string;
    name: string;
    clientName: string;
    startDate: string | Date;
    endDate: string | Date;
  };
}

function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const params = useParams<{ projectId: string }>();
  const base = `/dashboard/projects/${params.projectId}`;

  const navItems = [
    { label: "Overview", href: base, exact: true },
    { label: "Geography", href: `${base}/geography` },
    { label: "Visits", href: `${base}/visits` },
  ];

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
        <Link href={`${base}/visits`}>
          <Button variant="brand" size="sm">
            Visit List <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
