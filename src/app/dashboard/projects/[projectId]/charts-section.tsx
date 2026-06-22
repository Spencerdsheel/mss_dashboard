"use client";

import { useMemo } from "react";
import { DonutChart, DonutLegend } from "@/components/charts/donut-chart";
import { PhotoBarChart } from "@/components/charts/bar-chart";
import { TrendChart, CumulativeChart, LocationBarChart } from "@/components/charts/trend-chart";
import { LazyChart } from "@/components/lazy-chart";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera } from "lucide-react";
import { StaggerCards, StaggerCard } from "@/components/ui/stagger-cards";
import { buildTrendData, installGridClass } from "@/lib/chart-helpers";
import type { InstallSlot } from "@/server/analytics";

type MetricEntry = { key: string; label: string; value: number; unit?: string; category?: string };
type PhotoKind = Record<string, number>;

export type VisitChartRow = {
  visitDate: string;
  city: string | null;
  install1: string | null;
  install2: string | null;
  install3: string | null;
};

export function ChartsSection({
  totalVisits,
  installSlots,
  photoByKind,
  rowsWithNoPhotos,
  metrics,
  visitRows,
}: {
  totalVisits: number;
  installSlots: InstallSlot[];
  photoByKind: PhotoKind;
  rowsWithNoPhotos: number;
  metrics: MetricEntry[];
  visitRows: VisitChartRow[];
}) {
  const photoData = useMemo(
    () => [
      { slot: "Storefront", count: photoByKind["STOREFRONT"] ?? 0 },
      { slot: "P1", count: photoByKind["PHOTO_1"] ?? 0 },
      { slot: "P2", count: photoByKind["PHOTO_2"] ?? 0 },
      { slot: "P3", count: photoByKind["PHOTO_3"] ?? 0 },
      { slot: "P4", count: photoByKind["PHOTO_4"] ?? 0 },
      { slot: "P5", count: photoByKind["PHOTO_5"] ?? 0 },
      { slot: "P6", count: photoByKind["PHOTO_6"] ?? 0 },
      { slot: "P7", count: photoByKind["PHOTO_7"] ?? 0 },
      { slot: "P8", count: photoByKind["PHOTO_8"] ?? 0 },
      { slot: "P9", count: photoByKind["PHOTO_9"] ?? 0 },
    ],
    [photoByKind]
  );

  // --- Visits over time (daily buckets, sorted chronologically) ---
  const trendData = useMemo(
    () => buildTrendData(visitRows.map((v) => v.visitDate)),
    [visitRows]
  );

  // --- Cumulative install-1 success vs target ---
  const slot0 = installSlots[0] ?? null;
  const { cumulativeData, cumulativeTarget } = useMemo(() => {
    if (!slot0) return { cumulativeData: [], cumulativeTarget: null };

    const successLabels = new Set(
      slot0.distribution.filter((d) => d.is_success).map((d) => d.label)
    );

    // Build day → success-count map
    const dayCounts = new Map<string, number>();
    for (const v of visitRows) {
      const day = v.visitDate.slice(0, 10);
      const isSuccess = v.install1 != null && successLabels.has(v.install1);
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + (isSuccess ? 1 : 0));
    }

    const sorted = Array.from(dayCounts.entries()).sort(([a], [b]) => a.localeCompare(b));
    let running = 0;
    const cumulativeData = sorted.map(([date, daily]) => {
      running += daily;
      return { date, cumulative: running };
    });

    return {
      cumulativeData,
      cumulativeTarget: slot0.target && slot0.target > 0 ? slot0.target : null,
    };
  }, [visitRows, slot0]);

  // --- Visits by city (top 12) ---
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
      .slice(0, 12)
      .map(([city, count]) => ({ city, count }));
  }, [visitRows]);

  const gridCols = installGridClass(installSlots.length);

  return (
    <>
      {/* P1.4: Dynamic N donuts from installSlots */}
      <StaggerCards>
        <div className={`grid grid-cols-1 gap-4 ${gridCols}`}>
          {installSlots.map((slot) => (
            <StaggerCard key={slot.slot_index}>
              <LazyChart>
                <DonutCard
                  title={slot.title}
                  total={totalVisits}
                  data={slot.distribution}
                  successCount={slot.success_count}
                  target={slot.target}
                />
              </LazyChart>
            </StaggerCard>
          ))}
        </div>
      </StaggerCards>

      {/* Photo coverage + metrics */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-ventriloc lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium text-carbon">
                  Photo Coverage by Slot
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs text-slate">
                  Number of visits with a photo submitted per slot (0 – 9 + storefront)
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                <Camera className="mr-1 h-3 w-3" />
                {rowsWithNoPhotos.toLocaleString()} visits without photo
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <LazyChart>
              <PhotoBarChart data={photoData} />
            </LazyChart>
          </CardContent>
        </div>

        <div className="card-ventriloc">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-carbon">
              Targets &amp; Reference Metrics
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs text-slate">
              Project-level configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.map((m) => (
              <div
                key={m.key}
                className="flex items-center justify-between rounded-lg bg-fog px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium text-carbon">{m.label}</div>
                  <div className="text-[11px] text-slate">
                    {m.category === "target" ? "Target" : "Reference"} · {m.key}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="font-space-grotesk text-xl text-carbon"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    {m.value.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate">{m.unit}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </div>
      </div>

      {/* Trend + Cumulative row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Visits over time */}
        <div className="card-ventriloc">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-carbon">
              Visits over Time
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs text-slate">
              Daily visit count across the execution period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LazyChart>
              <TrendChart data={trendData} />
            </LazyChart>
          </CardContent>
        </div>

        {/* Cumulative success */}
        {slot0 ? (
          <div className="card-ventriloc">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-carbon">
                Cumulative — {slot0.title}
              </CardTitle>
              <CardDescription className="mt-0.5 text-xs text-slate">
                Running total of successful installs
                {cumulativeTarget ? ` · Target: ${cumulativeTarget.toLocaleString()}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LazyChart>
                <CumulativeChart data={cumulativeData} target={cumulativeTarget} />
              </LazyChart>
            </CardContent>
          </div>
        ) : null}
      </div>

      {/* Visits by location */}
      <div className="card-ventriloc">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-carbon">
            Visits by Location
          </CardTitle>
          <CardDescription className="mt-0.5 text-xs text-slate">
            Top cities by visit count
            {locationData.length === 12 ? " (top 12 shown)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LazyChart>
            <LocationBarChart data={locationData} />
          </LazyChart>
        </CardContent>
      </div>
    </>
  );
}

function DonutCard({
  title,
  data,
  total,
  successCount,
  target,
}: {
  title: string;
  data: Array<{ label: string; value: number; is_success: boolean }>;
  total: number;
  successCount: number;
  target?: number | null;
}) {
  const pct = total ? Math.round((successCount / total) * 100) : 0;

  return (
    <div className="card-ventriloc">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-carbon">{title}</CardTitle>
        <CardDescription className="text-xs text-slate">
          {successCount.toLocaleString()} / {total.toLocaleString()} installed ({pct}%)
          {target ? ` · Target: ${target.toLocaleString()}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <DonutChart
          data={data}
          total={total}
          centerLabel="Installed"
          centerValue={`${pct}%`}
        />
        <DonutLegend data={data} total={total} />
      </CardContent>
    </div>
  );
}
