// Sprint 13a — DEFAULT_LAYOUT parity test.
//
// No jsdom/@testing-library/react is installed in this project (vitest.config.ts
// runs environment: "node", tests/**/*.test.ts only), so this asserts the
// *config* that WidgetGrid walks — widget set, order, and col-span presets —
// against the pre-13a hardcoded OverviewGrid structure it must reproduce
// exactly, rather than rendering DOM. This is the mechanical contract behind
// .claude/specs/sprint-13a-widget-dashboard-renderer.md §3.1/§4.3/§4.4.

import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, WIDGET_SIZE_CLASS, GRID_TEMPLATE_ROWS } from "@/lib/dashboard-layout";
import { WIDGET_REGISTRY } from "@/lib/widget-registry";

// The exact widget set/order/size the pre-13a OverviewGrid rendered:
// Row 1 (88px): Total Visits (sm) · Execution Period (sm) · install-slot-0 (sm) · install-slot-1 (sm)
// Row 2 (1.4fr): install-donuts (lg=col-span-8) · banner-radar (md=col-span-4)
// Row 3 (1fr): visits-trend (lg=col-span-8) · top-locations (md=col-span-4)
const EXPECTED_SEQUENCE: Array<{ type: string; size: string }> = [
  { type: "kpi-total-visits", size: "sm" },
  { type: "kpi-execution-period", size: "sm" },
  { type: "kpi-install-slot", size: "sm" },
  { type: "kpi-install-slot", size: "sm" },
  { type: "install-donuts", size: "lg" },
  { type: "banner-radar", size: "md" },
  { type: "visits-trend", size: "lg" },
  { type: "top-locations", size: "md" },
];

describe("DEFAULT_LAYOUT parity with the pre-13a OverviewGrid", () => {
  it("has version 1", () => {
    expect(DEFAULT_LAYOUT.version).toBe(1);
  });

  it("reproduces the exact widget type + size sequence", () => {
    const actual = DEFAULT_LAYOUT.widgets.map((w) => ({ type: w.type, size: w.size }));
    expect(actual).toEqual(EXPECTED_SEQUENCE);
  });

  it("has unique widget ids", () => {
    const ids = DEFAULT_LAYOUT.widgets.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("install-slot-0 and install-slot-1 carry the correct slotIndex params", () => {
    const installSlotWidgets = DEFAULT_LAYOUT.widgets.filter((w) => w.type === "kpi-install-slot");
    expect(installSlotWidgets).toHaveLength(2);
    expect(installSlotWidgets[0].params).toEqual({ slotIndex: 0 });
    expect(installSlotWidgets[1].params).toEqual({ slotIndex: 1 });
  });

  it("every widget type in DEFAULT_LAYOUT exists in WIDGET_REGISTRY", () => {
    for (const widget of DEFAULT_LAYOUT.widgets) {
      expect(WIDGET_REGISTRY[widget.type]).toBeDefined();
    }
  });

  it("resolves each widget's size to the correct col-span class (§4.4 presets)", () => {
    const classes = DEFAULT_LAYOUT.widgets.map((w) => WIDGET_SIZE_CLASS[w.size]);
    expect(classes).toEqual([
      "col-span-3", // Total Visits
      "col-span-3", // Execution Period
      "col-span-3", // install-slot-0
      "col-span-3", // install-slot-1
      "col-span-8", // install-donuts
      "col-span-4", // banner-radar
      "col-span-8", // visits-trend
      "col-span-4", // top-locations
    ]);
  });

  it("preserves the outer grid shell's fixed row template", () => {
    expect(GRID_TEMPLATE_ROWS).toBe("88px minmax(0,1.4fr) minmax(0,1fr)");
  });

  it("does NOT place photo-funnel in the default layout (registered, but not default per §4.6)", () => {
    expect(WIDGET_REGISTRY["photo-funnel"]).toBeDefined();
    expect(DEFAULT_LAYOUT.widgets.some((w) => w.type === "photo-funnel")).toBe(false);
  });
});
