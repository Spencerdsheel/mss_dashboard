// Sprint 13a — config-driven widget dashboard: layout types + frozen default.
//
// `DEFAULT_LAYOUT` reproduces today's `OverviewGrid` output exactly (widget
// set, order, and column spans) — see overview-grid.tsx (pre-13a) and
// .claude/specs/sprint-13a-widget-dashboard-renderer.md §4.3. It is an
// explicit deterministic default, not a sample-data fallback (§5.2): the
// widgets still render real data, only their *arrangement* defaults here.
//
// Present/absent install-slot handling stays inside the "kpi-install-slot"
// widget (see src/components/dashboard-widgets.tsx) — this config only
// describes which widgets exist and in what order/size.

import type { InstallSlot } from "@/server/analytics";
import { WIDGET_REGISTRY } from "./widget-registry";

export type WidgetSize = "sm" | "md" | "lg" | "xl";

/** Constrained col-span presets — no free-form pixel placement (§4.4). */
export const WIDGET_SIZE_CLASS: Record<WidgetSize, string> = {
  sm: "col-span-3",
  md: "col-span-4",
  lg: "col-span-8",
  xl: "col-span-12",
};

/** The outer grid shell WidgetGrid reproduces; only the children come from config. */
export const GRID_TEMPLATE_ROWS = "88px minmax(0,1.4fr) minmax(0,1fr)";

export type WidgetInstance = {
  id: string; // stable unique id within the layout
  type: string; // must be a key in WIDGET_REGISTRY
  size: WidgetSize;
  params?: Record<string, string | number>; // e.g. { slotIndex: 1 } for kpi-install-slot
};

export type LayoutConfig = {
  version: 1;
  widgets: WidgetInstance[];
};

export type MetricEntry = {
  key: string;
  label: string;
  value: number;
  unit?: string;
  category?: string;
};

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

/** Named datasets a widget consumes — bound only from the RSC summary+visits
 * payload, never arbitrary DB fields or SQL (keeps the MVP backend-query-free). */
export type WidgetDataPayload = {
  summary: {
    totalVisits: number;
    uniqueStores: number;
    minDate: string | null;
    maxDate: string | null;
  };
  installSlots: InstallSlot[];
  visitRows: VisitChartRow[];
  dailyVisits: number[];
  photoByKind: Record<string, number>;
  metrics: MetricEntry[];
  locations?: Array<{ city: string; count: number }>;
};

/** Reproduces today's 3-row, 12-col OverviewGrid exactly:
 *  Row 1 (88px): Total Visits (sm) · Execution Period (sm) · install-slot-0 (sm) · install-slot-1 (sm)
 *  Row 2 (1.4fr): install-donuts (lg=col-span-8) · banner-radar (md=col-span-4)
 *  Row 3 (1fr): visits-trend (lg=col-span-8) · top-locations (md=col-span-4)
 */
export const DEFAULT_LAYOUT: LayoutConfig = {
  version: 1,
  widgets: [
    { id: "total-visits", type: "kpi-total-visits", size: "sm" },
    { id: "execution-period", type: "kpi-execution-period", size: "sm" },
    { id: "install-slot-0", type: "kpi-install-slot", size: "sm", params: { slotIndex: 0 } },
    { id: "install-slot-1", type: "kpi-install-slot", size: "sm", params: { slotIndex: 1 } },
    { id: "install-donuts", type: "install-donuts", size: "lg" },
    { id: "banner-radar", type: "banner-radar", size: "md" },
    { id: "visits-trend", type: "visits-trend", size: "lg" },
    { id: "top-locations", type: "top-locations", size: "md" },
  ],
};

// ── Sprint 13b — pure layout mutation reducers ──────────────────────────────
//
// Kept as pure functions over LayoutConfig (spec §4.5) so they're testable
// without rendering. Edit mode (widget-grid.tsx / widget-editor-toolbar.tsx)
// holds a draft LayoutConfig in component state and calls these on
// add/remove/reorder/resize/swap; Save posts the draft, Cancel discards it.

function makeWidgetId(type: string, existing: WidgetInstance[]): string {
  const used = new Set(existing.map((w) => w.id));
  let n = 1;
  let id = `${type}-${n}`;
  while (used.has(id)) {
    n += 1;
    id = `${type}-${n}`;
  }
  return id;
}

/** Appends a new widget of `type` at its registry defaultSize. No-op if
 * `type` isn't a known registry key. */
export function addWidgetToLayout(layout: LayoutConfig, type: string): LayoutConfig {
  const def = WIDGET_REGISTRY[type];
  if (!def) return layout;
  const id = makeWidgetId(type, layout.widgets);
  return {
    ...layout,
    widgets: [...layout.widgets, { id, type, size: def.defaultSize }],
  };
}

export function removeWidgetFromLayout(layout: LayoutConfig, id: string): LayoutConfig {
  return { ...layout, widgets: layout.widgets.filter((w) => w.id !== id) };
}

/** Moves the widget one position within source order — not arbitrary pixels
 * (§3.3). No-op at either boundary or for an unknown id. */
export function reorderWidgetInLayout(
  layout: LayoutConfig,
  id: string,
  direction: "up" | "down"
): LayoutConfig {
  const idx = layout.widgets.findIndex((w) => w.id === id);
  if (idx === -1) return layout;
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= layout.widgets.length) return layout;
  const widgets = [...layout.widgets];
  const tmp = widgets[idx];
  widgets[idx] = widgets[targetIdx];
  widgets[targetIdx] = tmp;
  return { ...layout, widgets };
}

/** Cycles/sets to one of the fixed WidgetSize presets only (§3.3). */
export function resizeWidgetInLayout(layout: LayoutConfig, id: string, size: WidgetSize): LayoutConfig {
  return {
    ...layout,
    widgets: layout.widgets.map((w) => (w.id === id ? { ...w, size } : w)),
  };
}

/** Swaps a widget's chart type, preserving its `id` and `size` (§3.3) — only
 * permitted among registry entries sharing the same `swapGroup`. No-op if
 * either type is unknown or the two don't share a swapGroup. */
export function swapWidgetInLayout(layout: LayoutConfig, id: string, newType: string): LayoutConfig {
  const target = layout.widgets.find((w) => w.id === id);
  if (!target) return layout;
  const currentDef = WIDGET_REGISTRY[target.type];
  const newDef = WIDGET_REGISTRY[newType];
  if (!currentDef || !newDef) return layout;
  if (!currentDef.swapGroup || currentDef.swapGroup !== newDef.swapGroup) return layout;
  return {
    ...layout,
    widgets: layout.widgets.map((w) => (w.id === id ? { ...w, type: newType } : w)),
  };
}

/** Registry entries that `type` may swap to (same swapGroup, excluding itself). */
export function swapCandidatesFor(type: string): string[] {
  const def = WIDGET_REGISTRY[type];
  if (!def?.swapGroup) return [];
  return Object.values(WIDGET_REGISTRY)
    .filter((d) => d.swapGroup === def.swapGroup && d.type !== type)
    .map((d) => d.type);
}
