"use client";

// Sprint 13a — widget bodies extracted from the pre-13a `OverviewGrid`
// (src/app/dashboard/projects/[projectId]/overview-grid.tsx). Chart internals
// and LazyChart wrapping are unchanged; each widget now owns the same derived
// computation it always did, just relocated so it can be registered in
// src/lib/widget-registry.ts and looked up by `type` from a stored layout.
//
// Judgment call: the spec's file list for 13a names widget-registry.ts,
// dashboard-layout.ts, and widget-grid.tsx explicitly but doesn't name a home
// for the widget body components themselves (WidgetDef.component needs an
// actual React.ComponentType). Putting them here (a new components/ file)
// keeps widget-registry.ts a plain data module (imports + references
// components, authors no JSX) consistent with "pure TS helpers in src/lib".

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Store, Calendar, Target } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { MiniSparkline } from "@/components/mini-sparkline";
import { TrendChart, LocationBarChart } from "@/components/charts/trend-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { DistributionPopover } from "@/components/charts/distribution-popover";
import { BannerRadarChart } from "@/components/charts/radar-chart";
import { PhotoFunnelChart } from "@/components/charts/funnel-chart";
import { PhotoBarChart } from "@/components/charts/bar-chart";
import { LazyChart } from "@/components/lazy-chart";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn, formatPct } from "@/lib/utils";
import { buildTrendData, installGridClass, buildRadarData, buildFunnelData } from "@/lib/chart-helpers";
import type { WidgetProps } from "@/lib/widget-registry";

function fmtShort(d: string): string {
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function ProgressRing({ progress, size = 24 }: { progress: number; size?: number }) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(1, progress));
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={2} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#ff682c"
        strokeWidth={2}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
    </svg>
  );
}

function KpiTile({
  icon,
  label,
  value,
  displayValue,
  sub,
  progress,
  sparkData,
  className,
  showRing,
  paceDelta,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  displayValue?: string;
  sub?: string;
  progress?: number;
  sparkData?: number[];
  className?: string;
  showRing?: boolean;
  paceDelta?: number | null;
}) {
  return (
    <div className={cn("card-ventriloc p-2 flex flex-col justify-between gap-0.5", className)}>
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="text-signal-orange">{icon}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={cn(
          value != null
            ? "font-space-grotesk text-xl text-foreground tabular-nums"
            : "font-space-grotesk text-xl font-medium text-foreground"
        )} style={{ letterSpacing: "-0.03em" }}>
          {value != null ? <AnimatedCounter value={value} /> : displayValue}
        </div>
        {showRing && typeof progress === "number" && (
          <ProgressRing progress={progress} />
        )}
        {sparkData && sparkData.length > 0 && (
          <MiniSparkline data={sparkData} />
        )}
        {typeof paceDelta === "number" && (
          <span className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums",
            paceDelta >= 0
              ? "bg-emerald-500/10 text-emerald-500"
              : "bg-red-500/10 text-red-500"
          )}>
            {paceDelta >= 0 ? "+" : ""}{paceDelta} vs pace
          </span>
        )}
      </div>
      {sub && <div className="text-[9px] text-muted-foreground truncate">{sub}</div>}
      {typeof progress === "number" && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function TotalVisitsKpiWidget({ data, className }: WidgetProps) {
  const { totalVisits, uniqueStores } = data.summary;
  return (
    <KpiTile
      className={className}
      icon={<Store className="h-4 w-4" />}
      label="Total Visits"
      value={totalVisits}
      sub={`${uniqueStores.toLocaleString()} unique stores`}
      sparkData={data.dailyVisits}
    />
  );
}

export function ExecutionPeriodKpiWidget({ data, className }: WidgetProps) {
  const { minDate, maxDate } = data.summary;
  const daysCount = minDate && maxDate
    ? Math.round((new Date(maxDate).getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;
  return (
    <KpiTile
      className={className}
      icon={<Calendar className="h-4 w-4" />}
      label="Execution Period"
      displayValue={`${daysCount}d`}
      sub={minDate && maxDate ? `${fmtShort(minDate)} → ${fmtShort(maxDate)}` : "—"}
    />
  );
}

/** Renders the install-slot KPI tile *or* its empty spacer, keyed off the
 * actual installSlots payload — present/absent handling stays in the widget,
 * not the layout config (spec §4.3), so a project with 0/1/3/4 slots still
 * renders correctly from the same DEFAULT_LAYOUT. */
export function InstallSlotKpiWidget({ data, params, className }: WidgetProps) {
  const slotIndex = typeof params?.slotIndex === "number" ? params.slotIndex : Number(params?.slotIndex ?? 0);
  const slot = data.installSlots[slotIndex] ?? null;
  const { totalVisits, minDate, maxDate } = data.summary;

  // paceDelta only ever showed on the first install-slot tile (slotIndex 0)
  // in the pre-13a component — preserved exactly here.
  const paceDelta = useMemo(() => {
    if (slotIndex !== 0 || !slot || !minDate || !maxDate) return null;

    const targetMetric = data.metrics.find(
      (m) => m.category === "target" && m.key.toLowerCase().includes("install")
    );
    const tgt = targetMetric?.value ?? slot.target ?? null;
    if (!tgt || tgt <= 0) return null;

    const totalDays = Math.max(
      1,
      (new Date(maxDate).getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const lastVisitDay = data.visitRows.reduce<string | null>((latest, v) => {
      const day = v.visitDate.slice(0, 10);
      return !latest || day > latest ? day : latest;
    }, null);
    const elapsedDays = lastVisitDay
      ? Math.max(1, (new Date(lastVisitDay).getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24))
      : totalDays;

    const expectedPace = (tgt / totalDays) * elapsedDays;
    return Math.round(slot.success_count - expectedPace);
  }, [slotIndex, slot, minDate, maxDate, data.metrics, data.visitRows]);

  if (!slot) return <div className={className} />;

  return (
    <KpiTile
      className={className}
      icon={<Target className="h-4 w-4" />}
      label={slot.title}
      value={slot.success_count}
      sub={`${formatPct(slot.success_count, totalVisits)} of visits`}
      progress={totalVisits ? slot.success_count / totalVisits : 0}
      showRing
      paceDelta={slotIndex === 0 ? paceDelta : undefined}
    />
  );
}

export function InstallDonutsWidget({ data, className }: WidgetProps) {
  const { installSlots } = data;
  const { totalVisits } = data.summary;
  return (
    <div className={cn(className, `grid grid-cols-1 gap-2 ${installGridClass(installSlots.length)}`)}>
      {installSlots.map((slot) => {
        const pct = totalVisits ? Math.round((slot.success_count / totalVisits) * 100) : 0;
        return (
          <div key={slot.slot_index} className="card-ventriloc flex flex-col min-h-0">
            <CardHeader className="pb-1 px-2.5 pt-2.5">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium text-foreground truncate">{slot.title}</CardTitle>
                <DistributionPopover data={slot.distribution} total={totalVisits} />
              </div>
              <CardDescription className="text-[11px] text-muted-foreground">
                {slot.success_count.toLocaleString()} / {totalVisits.toLocaleString()} ({pct}%)
                {slot.target ? ` · Target: ${slot.target.toLocaleString()}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 px-2.5 pb-2.5">
              <LazyChart>
                <DonutChart
                  data={slot.distribution}
                  total={totalVisits}
                  centerLabel="Installed"
                  centerValue={`${pct}%`}
                />
              </LazyChart>
            </CardContent>
          </div>
        );
      })}
    </div>
  );
}

export function BannerRadarWidget({ data, className }: WidgetProps) {
  const { radarData, banners: topBanners } = useMemo(
    () => buildRadarData(data.visitRows, data.installSlots),
    [data.visitRows, data.installSlots]
  );
  return (
    <div className={cn(className, "card-ventriloc flex flex-col p-2.5 min-h-0")}>
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[11px] font-medium text-muted-foreground">Banner Performance</span>
        <span className="text-[10px] text-muted-foreground">Top {topBanners.length}</span>
      </div>
      <div className="flex-1 min-h-0 mt-1">
        <LazyChart>
          <BannerRadarChart data={radarData} banners={topBanners} />
        </LazyChart>
      </div>
    </div>
  );
}

export function VisitsTrendWidget({ data, className }: WidgetProps) {
  const trendData = useMemo(
    () => buildTrendData(data.visitRows.map((v) => v.visitDate)),
    [data.visitRows]
  );
  return (
    <div className={cn(className, "card-ventriloc flex flex-col p-2.5 min-h-0")}>
      <span className="text-[11px] font-medium text-muted-foreground shrink-0">Visits over Time</span>
      <div className="flex-1 min-h-0 mt-1">
        <LazyChart>
          <TrendChart data={trendData} />
        </LazyChart>
      </div>
    </div>
  );
}

export function TopLocationsWidget({ data, projectId, className }: WidgetProps) {
  const router = useRouter();
  const locationData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of data.visitRows) {
      if (!v.city) continue;
      const city = v.city.trim();
      if (!city) continue;
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([city, count]) => ({ city, count }));
  }, [data.visitRows]);

  const maxCityCount = Math.max(1, ...locationData.map((d) => d.count));

  return (
    <div
      className={cn(className, "card-ventriloc flex flex-col p-2.5 min-h-0 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-[#ff682c]/30")}
      onClick={() => router.push(`/dashboard/projects/${projectId}/locations`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/dashboard/projects/${projectId}/locations`)}
    >
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[11px] font-medium text-muted-foreground">Top Locations</span>
        <span className="text-[10px] text-[#ff682c]">View map →</span>
      </div>
      <div className="flex-1 min-h-0 mt-2 flex flex-col justify-center gap-1.5">
        {locationData.map((d) => (
          <div key={d.city} className="flex items-center gap-2">
            <span className="text-[11px] text-foreground w-24 truncate">{d.city}</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-[#ff682c]"
                style={{ width: `${(d.count / maxCityCount) * 100}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground w-6 text-right">{d.count}</span>
          </div>
        ))}
        {locationData.length === 0 && (
          <span className="text-xs text-muted-foreground">No location data</span>
        )}
      </div>
    </div>
  );
}

/** New in 13a (registered but NOT placed in DEFAULT_LAYOUT) — backed by the
 * already-present buildFunnelData + PhotoFunnelChart. Makes the add-widget
 * menu in 13b non-trivial. */
export function PhotoFunnelWidget({ data, className }: WidgetProps) {
  const funnelData = useMemo(() => buildFunnelData(data.photoByKind), [data.photoByKind]);
  return (
    <div className={cn(className, "card-ventriloc flex flex-col p-2.5 min-h-0")}>
      <span className="text-[11px] font-medium text-muted-foreground shrink-0">Photo Funnel</span>
      <div className="flex-1 min-h-0 mt-1">
        <LazyChart>
          <PhotoFunnelChart data={funnelData} />
        </LazyChart>
      </div>
    </div>
  );
}

// ── Sprint 19 — 14 new widget primitives (spec §4). Each binds only to a
// named dataset already present in the RSC payload (`data` prop, per 13a's
// dataset-binding discipline, §6.6). No new repository methods/queries.

/** Simple wrapper card matching the other small chart-widget cards' shell. */
function WidgetCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(className, "card-ventriloc flex flex-col p-2.5 min-h-0")}>
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
        {action}
      </div>
      <div className="flex-1 min-h-0 mt-1">{children}</div>
    </div>
  );
}

/** Custom metric tile — kpi-metric, param `metricKey`. Mirrors
 * kpi-install-slot's slotIndex param pattern (13a §4.3). */
export function KpiMetricWidget({ data, params, className }: WidgetProps) {
  const metricKey = typeof params?.metricKey === "string" ? params.metricKey : undefined;
  const metric = data.metrics.find((m) => m.key === metricKey) ?? data.metrics[0];
  if (!metric) return <div className={className} />;
  return (
    <KpiTile
      className={className}
      icon={<Target className="h-4 w-4" />}
      label={metric.label}
      value={metric.value}
      sub={metric.unit ?? metric.category ?? undefined}
    />
  );
}

/** Horizontal bar per metric within one category — metrics-bar-list, param
 * `category`. */
export function MetricsBarListWidget({ data, params, className }: WidgetProps) {
  const category = typeof params?.category === "string" ? params.category : undefined;
  const metrics = useMemo(
    () => (category ? data.metrics.filter((m) => m.category === category) : data.metrics),
    [data.metrics, category]
  );
  const maxValue = Math.max(1, ...metrics.map((m) => m.value));
  return (
    <WidgetCard title={category ? `Metrics — ${category}` : "Metrics"} className={className}>
      <div className="flex h-full flex-col justify-center gap-1.5">
        {metrics.map((m) => (
          <div key={m.key} className="flex items-center gap-2">
            <span className="text-[11px] text-foreground w-24 truncate">{m.label}</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-[#ff682c]"
                style={{ width: `${(m.value / maxValue) * 100}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground w-10 text-right">
              {m.value.toLocaleString()}{m.unit ?? ""}
            </span>
          </div>
        ))}
        {metrics.length === 0 && (
          <span className="text-xs text-muted-foreground">No metrics</span>
        )}
      </div>
    </WidgetCard>
  );
}

/** Compact grid of all metrics (or all in a category) as small stat tiles —
 * metrics-grid. */
export function MetricsGridWidget({ data, params, className }: WidgetProps) {
  const category = typeof params?.category === "string" ? params.category : undefined;
  const metrics = useMemo(
    () => (category ? data.metrics.filter((m) => m.category === category) : data.metrics),
    [data.metrics, category]
  );
  return (
    <WidgetCard title="Metrics Overview" className={className}>
      <div className="grid h-full grid-cols-2 gap-1.5 overflow-auto">
        {metrics.map((m) => (
          <div key={m.key} className="rounded-md bg-muted/40 p-1.5">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground truncate">
              {m.label}
            </div>
            <div className="font-space-grotesk text-sm text-foreground tabular-nums">
              {m.value.toLocaleString()}{m.unit ?? ""}
            </div>
          </div>
        ))}
        {metrics.length === 0 && (
          <span className="col-span-2 text-xs text-muted-foreground">No metrics</span>
        )}
      </div>
    </WidgetCard>
  );
}

/** Single install-slot donut — install-donut-single, param `slotIndex`. */
export function InstallDonutSingleWidget({ data, params, className }: WidgetProps) {
  const slotIndex = typeof params?.slotIndex === "number" ? params.slotIndex : Number(params?.slotIndex ?? 0);
  const slot = data.installSlots[slotIndex] ?? data.installSlots[0];
  const { totalVisits } = data.summary;
  if (!slot) return <div className={className} />;
  const pct = totalVisits ? Math.round((slot.success_count / totalVisits) * 100) : 0;
  return (
    <div className={cn(className, "card-ventriloc flex flex-col min-h-0")}>
      <CardHeader className="pb-1 px-2.5 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-foreground truncate">{slot.title}</CardTitle>
          <DistributionPopover data={slot.distribution} total={totalVisits} />
        </div>
        <CardDescription className="text-[11px] text-muted-foreground">
          {slot.success_count.toLocaleString()} / {totalVisits.toLocaleString()} ({pct}%)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 px-2.5 pb-2.5">
        <LazyChart>
          <DonutChart data={slot.distribution} total={totalVisits} centerLabel="Installed" centerValue={`${pct}%`} />
        </LazyChart>
      </CardContent>
    </div>
  );
}

/** Grouped bar comparing success rate across all populated slots —
 * install-bar-compare. Alternative to banner-radar when slot count < 3. */
export function InstallBarCompareWidget({ data, className }: WidgetProps) {
  const { totalVisits } = data.summary;
  const barData = useMemo(
    () =>
      data.installSlots.map((slot) => ({
        slot: slot.title,
        count: totalVisits ? Math.round((slot.success_count / totalVisits) * 100) : 0,
      })),
    [data.installSlots, totalVisits]
  );
  return (
    <WidgetCard title="Install Slots Comparison" className={className}>
      <LazyChart>
        <PhotoBarChart data={barData.map((d) => ({ slot: d.slot, count: d.count }))} />
      </LazyChart>
    </WidgetCard>
  );
}

/** Sparkline-style success-rate-over-time for a single slot —
 * install-trend-mini, param `slotIndex`. Uses dailyVisits as the temporal
 * axis (no per-day install breakdown dataset exists, so this renders the
 * visit-volume trend as a proxy for install-rate activity for that slot). */
export function InstallTrendMiniWidget({ data, params, className }: WidgetProps) {
  const slotIndex = typeof params?.slotIndex === "number" ? params.slotIndex : Number(params?.slotIndex ?? 0);
  const slot = data.installSlots[slotIndex] ?? data.installSlots[0];
  if (!slot) return <div className={className} />;
  return (
    <WidgetCard title={`${slot.title} — Trend`} className={className}>
      <div className="flex h-full items-center">
        <MiniSparkline data={data.dailyVisits} height={48} />
      </div>
    </WidgetCard>
  );
}

/** Coverage-by-kind as a donut — photo-coverage-donut. Alternative to
 * photo-funnel for <=3 photo kinds. */
export function PhotoCoverageDonutWidget({ data, className }: WidgetProps) {
  const entries = Object.entries(data.photoByKind).filter(([, v]) => v > 0);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const donutData = entries.map(([label, value]) => ({ label, value }));
  return (
    <WidgetCard title="Photo Coverage" className={className}>
      <LazyChart>
        <DonutChart data={donutData} total={total} centerLabel="Photos" centerValue={total.toLocaleString()} />
      </LazyChart>
    </WidgetCard>
  );
}

/** Simple bar-per-kind photo count — photo-kind-bar. Plainest photo visual. */
export function PhotoKindBarWidget({ data, className }: WidgetProps) {
  const barData = useMemo(
    () => Object.entries(data.photoByKind).map(([slot, count]) => ({ slot, count })),
    [data.photoByKind]
  );
  return (
    <WidgetCard title="Photo Counts" className={className}>
      <LazyChart>
        <PhotoBarChart data={barData} />
      </LazyChart>
    </WidgetCard>
  );
}

/** Calendar-heatmap of daily visit counts — visits-heatmap-calendar. Simple
 * week-row grid rendering (no external calendar-heatmap dependency added,
 * per "no new dependencies unless the spec explicitly calls for one"). */
export function VisitsHeatmapCalendarWidget({ data, className }: WidgetProps) {
  const { dailyVisits } = data;
  const maxCount = Math.max(1, ...dailyVisits);
  return (
    <WidgetCard title="Visits Calendar" className={className}>
      <div className="flex h-full flex-wrap content-start gap-1 overflow-auto">
        {dailyVisits.map((count, i) => {
          const intensity = count / maxCount;
          return (
            <div
              key={i}
              title={`${count} visits`}
              className="h-3 w-3 rounded-sm"
              style={{
                background: intensity > 0
                  ? `rgba(255, 104, 44, ${0.15 + intensity * 0.85})`
                  : "hsl(var(--muted))",
              }}
            />
          );
        })}
        {dailyVisits.length === 0 && (
          <span className="text-xs text-muted-foreground">No visit data</span>
        )}
      </div>
    </WidgetCard>
  );
}

/** Slim single-row band: total visits + date range + unique-store count —
 * visits-summary-band. Consolidates 2 KPI tiles into 1 widget. */
export function VisitsSummaryBandWidget({ data, className }: WidgetProps) {
  const { totalVisits, uniqueStores, minDate, maxDate } = data.summary;
  return (
    <div className={cn(className, "card-ventriloc flex items-center justify-between gap-4 px-3 py-2")}>
      <div className="flex items-center gap-1.5">
        <Store className="h-3.5 w-3.5 text-signal-orange" />
        <span className="font-space-grotesk text-sm text-foreground tabular-nums">
          {totalVisits.toLocaleString()}
        </span>
        <span className="text-[10px] text-muted-foreground">visits</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-space-grotesk text-sm text-foreground tabular-nums">
          {uniqueStores.toLocaleString()}
        </span>
        <span className="text-[10px] text-muted-foreground">stores</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-signal-orange" />
        <span className="text-[10px] text-muted-foreground">
          {minDate && maxDate ? `${fmtShort(minDate)} – ${fmtShort(maxDate)}` : "—"}
        </span>
      </div>
    </div>
  );
}

/** Bar-chart alternative to top-locations' list presentation —
 * locations-bar. Same dataset (visitRows), same swapGroup ("locations"). */
export function LocationsBarWidget({ data, className }: WidgetProps) {
  const locationData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of data.visitRows) {
      if (!v.city) continue;
      const city = v.city.trim();
      if (!city) continue;
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([city, count]) => ({ city, count }));
  }, [data.visitRows]);

  return (
    <WidgetCard title="Top Locations" className={className}>
      <LazyChart>
        <LocationBarChart data={locationData} />
      </LazyChart>
    </WidgetCard>
  );
}

/** Text/stat summary of geographic spread — locations-map-lite. Graceful
 * primitive for low city-diversity projects. */
export function LocationsMapLiteWidget({ data, className }: WidgetProps) {
  const cityCount = useMemo(() => {
    const cities = new Set<string>();
    for (const v of data.visitRows) {
      if (v.city && v.city.trim()) cities.add(v.city.trim());
    }
    return cities.size;
  }, [data.visitRows]);

  return (
    <WidgetCard title="Store Distribution" className={className}>
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <span className="font-space-grotesk text-3xl text-foreground" style={{ letterSpacing: "-0.04em" }}>
          {cityCount}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {cityCount === 1 ? "city" : "cities"} · {data.summary.uniqueStores.toLocaleString()} stores
        </span>
      </div>
    </WidgetCard>
  );
}

/** Meta-widget: renders which data shapes are populated for this project —
 * data-coverage-summary. First-tile orientation widget for sparse projects. */
export function DataCoverageSummaryWidget({ data, className }: WidgetProps) {
  const photoKindCount = Object.values(data.photoByKind).filter((v) => v > 0).length;
  const rows = [
    { label: "Install slots", value: data.installSlots.length },
    { label: "Photo kinds tracked", value: photoKindCount },
    { label: "Custom metrics", value: data.metrics.length },
    { label: "Total visits", value: data.summary.totalVisits },
  ];
  return (
    <WidgetCard title="Data Coverage" className={className}>
      <div className="flex h-full flex-col justify-center gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium text-foreground tabular-nums">{r.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}

/** Static placeholder — empty-state-note. No data dependency; fills a slot
 * on a very sparse project without inventing a chart from nothing. */
export function EmptyStateNoteWidget({ className }: WidgetProps) {
  return (
    <div className={cn(className, "card-ventriloc flex flex-col items-center justify-center gap-1 p-2.5 min-h-0")}>
      <span className="text-[11px] text-muted-foreground text-center">
        More data will appear here as the campaign progresses.
      </span>
    </div>
  );
}
