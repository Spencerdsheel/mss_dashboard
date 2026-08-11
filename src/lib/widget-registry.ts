// Sprint 13a — widget registry: widget `type` -> component + dataset key.
//
// This module authors no JSX itself — it imports the actual widget body
// components (src/components/dashboard-widgets.tsx) and references them as
// values, keeping it a plain data module per "pure TS helpers in src/lib".
//
// The registry binds only named datasets from the RSC summary+visits payload
// — never arbitrary DB fields or SQL (§4 of the spec: keeps the MVP
// backend-query-free).

import type { ComponentType } from "react";
import type { WidgetSize, WidgetDataPayload } from "./dashboard-layout";
import {
  TotalVisitsKpiWidget,
  ExecutionPeriodKpiWidget,
  InstallSlotKpiWidget,
  InstallDonutsWidget,
  BannerRadarWidget,
  VisitsTrendWidget,
  TopLocationsWidget,
  PhotoFunnelWidget,
  KpiMetricWidget,
  MetricsBarListWidget,
  MetricsGridWidget,
  InstallDonutSingleWidget,
  InstallBarCompareWidget,
  InstallTrendMiniWidget,
  PhotoCoverageDonutWidget,
  PhotoKindBarWidget,
  VisitsHeatmapCalendarWidget,
  VisitsSummaryBandWidget,
  LocationsBarWidget,
  LocationsMapLiteWidget,
  DataCoverageSummaryWidget,
  EmptyStateNoteWidget,
} from "@/components/dashboard-widgets";
import { GeoKpiCities, GeoKpiTopCity, GeoKpiAverage, GeoMap, GeoRankedCities } from "@/components/location-widgets";

export type WidgetDataset =
  | "summary" // totalVisits, uniqueStores, minDate, maxDate
  | "installSlots" // InstallSlot[]
  | "visitRows" // VisitChartRow[]
  | "dailyVisits" // number[]
  | "photoByKind" // Record<string, number>
  | "metrics"; // MetricEntry[]

export type WidgetProps = {
  projectId: string;
  data: WidgetDataPayload;
  params?: Record<string, string | number>;
  className?: string;
};

export type WidgetDef = {
  type: string;
  label: string; // human name (used by 13b's add-widget menu)
  datasets: WidgetDataset[]; // which named payloads it consumes
  defaultSize: WidgetSize;
  swapGroup?: string; // widgets in the same group are chart-type-swappable (13b)
  component: ComponentType<WidgetProps>;
};

export const WIDGET_REGISTRY: Record<string, WidgetDef> = {
  "kpi-total-visits": {
    type: "kpi-total-visits",
    label: "Total Visits",
    datasets: ["summary", "dailyVisits"],
    defaultSize: "sm",
    component: TotalVisitsKpiWidget,
  },
  "kpi-execution-period": {
    type: "kpi-execution-period",
    label: "Execution Period",
    datasets: ["summary"],
    defaultSize: "sm",
    component: ExecutionPeriodKpiWidget,
  },
  "kpi-install-slot": {
    type: "kpi-install-slot",
    label: "Install KPI",
    datasets: ["installSlots", "summary", "metrics", "visitRows"],
    defaultSize: "sm",
    component: InstallSlotKpiWidget,
  },
  "install-donuts": {
    type: "install-donuts",
    label: "Install Distribution",
    datasets: ["installSlots", "summary"],
    defaultSize: "lg",
    component: InstallDonutsWidget,
  },
  "banner-radar": {
    type: "banner-radar",
    label: "Banner Performance",
    datasets: ["visitRows", "installSlots"],
    defaultSize: "md",
    component: BannerRadarWidget,
  },
  "visits-trend": {
    type: "visits-trend",
    label: "Visits over Time",
    datasets: ["visitRows"],
    defaultSize: "lg",
    component: VisitsTrendWidget,
  },
  "top-locations": {
    type: "top-locations",
    label: "Top Locations",
    datasets: ["visitRows"],
    defaultSize: "md",
    swapGroup: "locations",
    component: TopLocationsWidget,
  },
  "photo-funnel": {
    type: "photo-funnel",
    label: "Photo Funnel",
    datasets: ["photoByKind"],
    defaultSize: "lg",
    swapGroup: "photos",
    component: PhotoFunnelWidget,
  },
  // ── Sprint 19 — 14 new v1 primitives (spec §4) ──────────────────────────
  "kpi-metric": {
    type: "kpi-metric",
    label: "Custom Metric Tile",
    datasets: ["metrics"],
    defaultSize: "sm",
    component: KpiMetricWidget,
  },
  "metrics-bar-list": {
    type: "metrics-bar-list",
    label: "Metrics Bar List",
    datasets: ["metrics"],
    defaultSize: "md",
    component: MetricsBarListWidget,
  },
  "metrics-grid": {
    type: "metrics-grid",
    label: "Metrics Grid",
    datasets: ["metrics"],
    defaultSize: "md",
    component: MetricsGridWidget,
  },
  "install-donut-single": {
    type: "install-donut-single",
    label: "Single Install-Slot Donut",
    datasets: ["installSlots"],
    defaultSize: "md",
    component: InstallDonutSingleWidget,
  },
  "install-bar-compare": {
    type: "install-bar-compare",
    label: "Install Slots Bar Comparison",
    datasets: ["installSlots"],
    defaultSize: "md",
    swapGroup: "install-compare",
    component: InstallBarCompareWidget,
  },
  "install-trend-mini": {
    type: "install-trend-mini",
    label: "Install Rate Mini-Trend",
    datasets: ["installSlots", "dailyVisits"],
    defaultSize: "sm",
    component: InstallTrendMiniWidget,
  },
  "photo-coverage-donut": {
    type: "photo-coverage-donut",
    label: "Photo Coverage Donut",
    datasets: ["photoByKind"],
    defaultSize: "md",
    swapGroup: "photos",
    component: PhotoCoverageDonutWidget,
  },
  "photo-kind-bar": {
    type: "photo-kind-bar",
    label: "Photo Counts Bar",
    datasets: ["photoByKind"],
    defaultSize: "md",
    swapGroup: "photos",
    component: PhotoKindBarWidget,
  },
  "visits-heatmap-calendar": {
    type: "visits-heatmap-calendar",
    label: "Visits Calendar Heatmap",
    datasets: ["dailyVisits"],
    defaultSize: "lg",
    swapGroup: "visits-trend",
    component: VisitsHeatmapCalendarWidget,
  },
  "visits-summary-band": {
    type: "visits-summary-band",
    label: "Visits Summary Band",
    datasets: ["summary"],
    defaultSize: "md",
    component: VisitsSummaryBandWidget,
  },
  "locations-bar": {
    type: "locations-bar",
    label: "Top Locations (Bar)",
    datasets: ["visitRows"],
    defaultSize: "md",
    swapGroup: "locations",
    component: LocationsBarWidget,
  },
  "locations-map-lite": {
    type: "locations-map-lite",
    label: "Store Distribution Note",
    datasets: ["visitRows"],
    defaultSize: "sm",
    component: LocationsMapLiteWidget,
  },
  "data-coverage-summary": {
    type: "data-coverage-summary",
    label: "Data Coverage Summary",
    datasets: ["summary", "installSlots", "photoByKind", "metrics"],
    defaultSize: "md",
    component: DataCoverageSummaryWidget,
  },
  "empty-state-note": {
    type: "empty-state-note",
    label: "Placeholder Note",
    datasets: [],
    defaultSize: "sm",
    component: EmptyStateNoteWidget,
  },
  "geo-kpi-cities": { type:"geo-kpi-cities", label:"Cities", datasets:["summary"], defaultSize:"md", component:GeoKpiCities },
  "geo-kpi-top-city": { type:"geo-kpi-top-city", label:"Top City", datasets:["summary"], defaultSize:"md", component:GeoKpiTopCity },
  "geo-kpi-avg-per-city": { type:"geo-kpi-avg-per-city", label:"Avg / City", datasets:["summary"], defaultSize:"md", component:GeoKpiAverage },
  "geo-map": { type:"geo-map", label:"Geographic Distribution", datasets:["summary"], defaultSize:"lg", component:GeoMap },
  "geo-ranked-cities": { type:"geo-ranked-cities", label:"Ranked Cities", datasets:["summary"], defaultSize:"md", component:GeoRankedCities },
};
