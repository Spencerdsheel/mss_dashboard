"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Store, Calendar, Target } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { MiniSparkline } from "@/components/mini-sparkline";
import { TrendChart } from "@/components/charts/trend-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { DistributionPopover } from "@/components/charts/distribution-popover";
import { BannerRadarChart } from "@/components/charts/radar-chart";
import { LazyChart } from "@/components/lazy-chart";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn, formatPct } from "@/lib/utils";
import { buildTrendData, installGridClass, buildRadarData } from "@/lib/chart-helpers";
import type { InstallSlot } from "@/server/analytics";

type MetricEntry = { key: string; label: string; value: number; unit?: string; category?: string };

export type VisitChartRow = {
  visitDate: string;
  city: string | null;
  install1: string | null;
  install2: string | null;
  install3: string | null;
  visitTime: string | null;
  storeName: string | null;
  photoCount: number;
};

export function OverviewGrid({
  projectId,
  totalVisits,
  uniqueStores,
  minDate,
  maxDate,
  installSlots,
  metrics,
  visitRows,
  dailyVisits,
}: {
  projectId: string;
  totalVisits: number;
  uniqueStores: number;
  minDate: string | null;
  maxDate: string | null;
  installSlots: InstallSlot[];
  metrics: MetricEntry[];
  visitRows: VisitChartRow[];
  dailyVisits: number[];
}) {
  const router = useRouter();
  const slot0 = installSlots[0] ?? null;
  const slot1 = installSlots[1] ?? null;

  const paceDelta = useMemo(() => {
    if (!slot0 || !minDate || !maxDate) return null;

    const targetMetric = metrics.find(
      (m) => m.category === "target" && m.key.toLowerCase().includes("install")
    );
    const tgt = targetMetric?.value ?? slot0.target ?? null;
    if (!tgt || tgt <= 0) return null;

    const totalDays = Math.max(
      1,
      (new Date(maxDate).getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const lastVisitDay = visitRows.reduce<string | null>((latest, v) => {
      const day = v.visitDate.slice(0, 10);
      return !latest || day > latest ? day : latest;
    }, null);
    const elapsedDays = lastVisitDay
      ? Math.max(1, (new Date(lastVisitDay).getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24))
      : totalDays;

    const expectedPace = (tgt / totalDays) * elapsedDays;
    return Math.round(slot0.success_count - expectedPace);
  }, [slot0, visitRows, metrics, minDate, maxDate]);

  const trendData = useMemo(
    () => buildTrendData(visitRows.map((v) => v.visitDate)),
    [visitRows]
  );

  const { radarData, banners: topBanners } = useMemo(
    () => buildRadarData(visitRows, installSlots),
    [visitRows, installSlots]
  );

  const locationData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of visitRows) {
      if (!v.city) continue;
      const city = v.city.trim();
      if (!city) continue;
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([city, count]) => ({ city, count }));
  }, [visitRows]);

  const maxCityCount = Math.max(1, ...locationData.map((d) => d.count));

  const daysCount = minDate && maxDate
    ? Math.round((new Date(maxDate).getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  return (
    <div className="grid h-full grid-cols-12 gap-2 overflow-hidden" style={{ gridTemplateRows: "88px minmax(0,1.4fr) minmax(0,1fr)" }}>
      {/* ── ROW 1: KPI Cards ── */}
      <KpiTile
        className="col-span-3"
        icon={<Store className="h-4 w-4" />}
        label="Total Visits"
        value={totalVisits}
        sub={`${uniqueStores.toLocaleString()} unique stores`}
        sparkData={dailyVisits}
      />
      <KpiTile
        className="col-span-3"
        icon={<Calendar className="h-4 w-4" />}
        label="Execution Period"
        displayValue={`${daysCount}d`}
        sub={minDate && maxDate ? `${fmtShort(minDate)} → ${fmtShort(maxDate)}` : "—"}
      />
      {slot0 && (
        <KpiTile
          className="col-span-3"
          icon={<Target className="h-4 w-4" />}
          label={slot0.title}
          value={slot0.success_count}
          sub={`${formatPct(slot0.success_count, totalVisits)} of visits`}
          progress={totalVisits ? slot0.success_count / totalVisits : 0}
          showRing
          paceDelta={paceDelta}
        />
      )}
      {slot1 && (
        <KpiTile
          className="col-span-3"
          icon={<Target className="h-4 w-4" />}
          label={slot1.title}
          value={slot1.success_count}
          sub={`${formatPct(slot1.success_count, totalVisits)} of visits`}
          progress={totalVisits ? slot1.success_count / totalVisits : 0}
          showRing
        />
      )}
      {!slot0 && <div className="col-span-3" />}
      {!slot1 && <div className="col-span-3" />}

      {/* ── ROW 2: Donut cards (col 1-8) + Banner Performance (col 9-12) ── */}
      <div className={`col-span-8 grid grid-cols-1 gap-2 ${installGridClass(installSlots.length)}`}>
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

      <div className="col-span-4 card-ventriloc flex flex-col p-2.5 min-h-0">
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

      {/* ── ROW 3: Visits over Time (col 1-8) + Top Locations (col 9-12) ── */}
      <div className="col-span-8 card-ventriloc flex flex-col p-2.5 min-h-0">
        <span className="text-[11px] font-medium text-muted-foreground shrink-0">Visits over Time</span>
        <div className="flex-1 min-h-0 mt-1">
          <LazyChart>
            <TrendChart data={trendData} />
          </LazyChart>
        </div>
      </div>

      <div
        className="col-span-4 card-ventriloc flex flex-col p-2.5 min-h-0 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-[#ff682c]/30"
        onClick={() => router.push(`/dashboard/projects/${projectId}/geography`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && router.push(`/dashboard/projects/${projectId}/geography`)}
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
    </div>
  );
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
    <div className={cn("card-ventriloc p-3 flex flex-col justify-between", className)}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="text-signal-orange">{icon}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className={cn(
          value != null
            ? "font-space-grotesk text-2xl text-foreground tabular-nums"
            : "font-space-grotesk text-2xl font-medium text-foreground"
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
            "rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums",
            paceDelta >= 0
              ? "bg-emerald-500/10 text-emerald-500"
              : "bg-red-500/10 text-red-500"
          )}>
            {paceDelta >= 0 ? "+" : ""}{paceDelta} vs pace
          </span>
        )}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      {typeof progress === "number" && (
        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function fmtShort(d: string): string {
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
