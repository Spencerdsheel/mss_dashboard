// Sprint 13b — pure layout mutation reducer tests (§4.5, §2 "a Vitest test
// for the client-side layout mutation reducers"). These assert the reducers
// in src/lib/dashboard-layout.ts without rendering any component.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  addWidgetToLayout,
  removeWidgetFromLayout,
  reorderWidgetInLayout,
  resizeWidgetInLayout,
  swapWidgetInLayout,
  swapCandidatesFor,
  type LayoutConfig,
} from "@/lib/dashboard-layout";

function layoutOf(types: string[]): LayoutConfig {
  return {
    version: 1,
    widgets: types.map((type, i) => ({ id: `w${i}`, type, size: "sm" as const })),
  };
}

describe("addWidgetToLayout", () => {
  it("appends a new widget at its registry defaultSize", () => {
    const layout = layoutOf(["kpi-total-visits"]);
    const next = addWidgetToLayout(layout, "photo-funnel");
    expect(next.widgets).toHaveLength(2);
    expect(next.widgets[1].type).toBe("photo-funnel");
    expect(next.widgets[1].size).toBe("lg"); // photo-funnel's defaultSize
  });

  it("is a no-op for an unknown widget type", () => {
    const layout = layoutOf(["kpi-total-visits"]);
    const next = addWidgetToLayout(layout, "does-not-exist");
    expect(next).toEqual(layout);
  });

  it("generates a unique id even with repeated adds of the same type", () => {
    let layout = layoutOf([]);
    layout = addWidgetToLayout(layout, "photo-funnel");
    layout = addWidgetToLayout(layout, "photo-funnel");
    const ids = layout.widgets.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not mutate the original layout", () => {
    const layout = layoutOf(["kpi-total-visits"]);
    addWidgetToLayout(layout, "photo-funnel");
    expect(layout.widgets).toHaveLength(1);
  });
});

describe("removeWidgetFromLayout", () => {
  it("removes the widget with the given id", () => {
    const layout = layoutOf(["kpi-total-visits", "top-locations"]);
    const next = removeWidgetFromLayout(layout, "w0");
    expect(next.widgets.map((w) => w.id)).toEqual(["w1"]);
  });

  it("is a no-op for an unknown id", () => {
    const layout = layoutOf(["kpi-total-visits"]);
    const next = removeWidgetFromLayout(layout, "not-here");
    expect(next.widgets).toHaveLength(1);
  });
});

describe("reorderWidgetInLayout", () => {
  it("moves a widget up within source order", () => {
    const layout = layoutOf(["a", "b", "c"].map(() => "kpi-total-visits"));
    const next = reorderWidgetInLayout(layout, "w1", "up");
    expect(next.widgets.map((w) => w.id)).toEqual(["w1", "w0", "w2"]);
  });

  it("moves a widget down within source order", () => {
    const layout = layoutOf(["a", "b", "c"].map(() => "kpi-total-visits"));
    const next = reorderWidgetInLayout(layout, "w1", "down");
    expect(next.widgets.map((w) => w.id)).toEqual(["w0", "w2", "w1"]);
  });

  it("is a no-op at the top boundary", () => {
    const layout = layoutOf(["a", "b"].map(() => "kpi-total-visits"));
    const next = reorderWidgetInLayout(layout, "w0", "up");
    expect(next.widgets.map((w) => w.id)).toEqual(["w0", "w1"]);
  });

  it("is a no-op at the bottom boundary", () => {
    const layout = layoutOf(["a", "b"].map(() => "kpi-total-visits"));
    const next = reorderWidgetInLayout(layout, "w1", "down");
    expect(next.widgets.map((w) => w.id)).toEqual(["w0", "w1"]);
  });
});

describe("resizeWidgetInLayout", () => {
  it("sets the widget's size to one of the fixed presets", () => {
    const layout = layoutOf(["kpi-total-visits"]);
    const next = resizeWidgetInLayout(layout, "w0", "xl");
    expect(next.widgets[0].size).toBe("xl");
  });

  it("leaves other widgets untouched", () => {
    const layout = layoutOf(["kpi-total-visits", "top-locations"]);
    const next = resizeWidgetInLayout(layout, "w0", "lg");
    expect(next.widgets[1].size).toBe("sm");
  });
});

describe("swapWidgetInLayout / swapCandidatesFor", () => {
  it("returns no candidates for widgets with no registered swapGroup", () => {
    // 13a/13b registered no swapGroup pairs (no second chart type existed
    // yet for any distribution). Sprint 19 introduces the first real pairs
    // (top-locations <-> locations-bar; photo-funnel <-> the two new photo
    // primitives) — those three are asserted separately below. The KPI
    // tiles, install-donuts, and banner-radar still have no swap partner.
    for (const type of [
      "kpi-total-visits",
      "kpi-execution-period",
      "kpi-install-slot",
      "install-donuts",
      "banner-radar",
      "visits-trend",
    ]) {
      expect(swapCandidatesFor(type)).toEqual([]);
    }
  });

  it("sprint 19: top-locations and locations-bar share the 'locations' swapGroup", () => {
    expect(swapCandidatesFor("top-locations")).toEqual(["locations-bar"]);
    expect(swapCandidatesFor("locations-bar")).toEqual(["top-locations"]);
  });

  it("sprint 19: photo-funnel, photo-coverage-donut, and photo-kind-bar share the 'photos' swapGroup", () => {
    expect(swapCandidatesFor("photo-funnel").sort()).toEqual([
      "photo-coverage-donut",
      "photo-kind-bar",
    ]);
  });

  it("is a no-op when the two types don't share a swapGroup", () => {
    const layout = layoutOf(["kpi-total-visits"]);
    const next = swapWidgetInLayout(layout, "w0", "top-locations");
    expect(next.widgets[0].type).toBe("kpi-total-visits");
  });

  it("is a no-op for an unknown target type", () => {
    const layout = layoutOf(["kpi-total-visits"]);
    const next = swapWidgetInLayout(layout, "w0", "does-not-exist");
    expect(next.widgets[0].type).toBe("kpi-total-visits");
  });

  it("is a no-op for an unknown widget id", () => {
    const layout = layoutOf(["kpi-total-visits"]);
    const next = swapWidgetInLayout(layout, "not-here", "top-locations");
    expect(next).toEqual(layout);
  });
});

describe("reducers preserve DEFAULT_LAYOUT invariants when chained", () => {
  it("add then remove returns to the original widget count", () => {
    let layout: LayoutConfig = DEFAULT_LAYOUT;
    layout = addWidgetToLayout(layout, "photo-funnel");
    expect(layout.widgets).toHaveLength(DEFAULT_LAYOUT.widgets.length + 1);
    const addedId = layout.widgets[layout.widgets.length - 1].id;
    layout = removeWidgetFromLayout(layout, addedId);
    expect(layout.widgets).toHaveLength(DEFAULT_LAYOUT.widgets.length);
  });
});
