// Sprint 16 §4.6: Visits page has no KPI card row today — this adds one,
// reusing the `summary` object the page already fetches (getProjectSummary,
// no new backend call). `KpiTile` in dashboard-widgets.tsx is a
// module-private, non-exported component (used internally by the
// WidgetProps-typed widget exports), so rather than change that file's
// export surface, this is a small dedicated component matching the same
// tightened padding/typography treatment applied in §4.7 (Overview's
// KpiTile, Geography's GeoKpi) — kept visually consistent from the start.

import { Store, Calendar, MapPin, Camera } from "lucide-react";

function fmtShort(d: string): string {
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function VisitsKpiTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card-ventriloc p-2 flex flex-col justify-between gap-0.5">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="text-signal-orange">{icon}</span>
      </div>
      <div
        className="font-space-grotesk text-xl text-foreground truncate tabular-nums"
        style={{ letterSpacing: "-0.03em" }}
      >
        {value}
      </div>
      <div className="text-[9px] text-muted-foreground truncate">{sub}</div>
    </div>
  );
}

export function VisitsKpiRow({
  totalVisits,
  uniqueStores,
  minDate,
  maxDate,
  rowsWithNoPhotos,
}: {
  totalVisits: number;
  uniqueStores: number;
  minDate: string | null;
  maxDate: string | null;
  rowsWithNoPhotos: number;
}) {
  const daysCount =
    minDate && maxDate
      ? Math.round((new Date(maxDate).getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 0;
  const photoCoveragePct =
    totalVisits > 0 ? Math.round(((totalVisits - rowsWithNoPhotos) / totalVisits) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 shrink-0 md:grid-cols-4">
      <VisitsKpiTile
        icon={<Store className="h-4 w-4" />}
        label="Total Visits"
        value={totalVisits.toLocaleString()}
        sub={`${uniqueStores.toLocaleString()} unique stores`}
      />
      <VisitsKpiTile
        icon={<MapPin className="h-4 w-4" />}
        label="Unique Stores"
        value={uniqueStores.toLocaleString()}
        sub="stores visited"
      />
      <VisitsKpiTile
        icon={<Calendar className="h-4 w-4" />}
        label="Date Range"
        value={`${daysCount}d`}
        sub={minDate && maxDate ? `${fmtShort(minDate)} → ${fmtShort(maxDate)}` : "—"}
      />
      <VisitsKpiTile
        icon={<Camera className="h-4 w-4" />}
        label="Photo Coverage"
        value={`${photoCoveragePct}%`}
        sub={`${rowsWithNoPhotos.toLocaleString()} without photos`}
      />
    </div>
  );
}
