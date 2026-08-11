// Sprint 19 — registry-shape tests for the 14 new widget primitives (spec §4).
//
// No jsdom/@testing-library/react is installed in this project
// (vitest.config.ts runs environment: "node"), so — consistent with the
// existing per-widget test pattern in this repo (allowed-widget-types.test.ts,
// dashboard-layout.test.ts) — these assert the *registry config* each new
// widget is defined by (type/label/datasets/defaultSize/component), not DOM
// output. This is the mechanical contract behind §6.6's dataset-binding
// discipline: every widget must declare only named datasets already present
// in WidgetDataPayload, never an arbitrary DB field.

import { describe, expect, it } from "vitest";
import { WIDGET_REGISTRY, type WidgetDataset } from "@/lib/widget-registry";

const KNOWN_DATASETS: WidgetDataset[] = [
  "summary",
  "installSlots",
  "visitRows",
  "dailyVisits",
  "photoByKind",
  "metrics",
];

const NEW_WIDGET_TYPES = [
  "kpi-metric",
  "metrics-bar-list",
  "metrics-grid",
  "install-donut-single",
  "install-bar-compare",
  "install-trend-mini",
  "photo-coverage-donut",
  "photo-kind-bar",
  "visits-heatmap-calendar",
  "visits-summary-band",
  "locations-bar",
  "locations-map-lite",
  "data-coverage-summary",
  "empty-state-note",
];

describe("sprint 19 new widget registry entries", () => {
  it.each(NEW_WIDGET_TYPES)("%s is registered with a component and label", (type) => {
    const def = WIDGET_REGISTRY[type];
    expect(def).toBeDefined();
    expect(def.type).toBe(type);
    expect(typeof def.label).toBe("string");
    expect(def.label.length).toBeGreaterThan(0);
    expect(def.component).toBeDefined();
    expect(["sm", "md", "lg", "xl"]).toContain(def.defaultSize);
  });

  it.each(NEW_WIDGET_TYPES)("%s only declares datasets already in WidgetDataPayload", (type) => {
    const def = WIDGET_REGISTRY[type];
    for (const dataset of def.datasets) {
      expect(KNOWN_DATASETS).toContain(dataset);
    }
  });

  it("empty-state-note declares no dataset dependency", () => {
    expect(WIDGET_REGISTRY["empty-state-note"].datasets).toEqual([]);
  });

  it("kpi-metric and metrics widgets depend on the metrics dataset", () => {
    for (const type of ["kpi-metric", "metrics-bar-list", "metrics-grid"]) {
      expect(WIDGET_REGISTRY[type].datasets).toContain("metrics");
    }
  });

  it("install-* new widgets depend on installSlots", () => {
    for (const type of ["install-donut-single", "install-bar-compare", "install-trend-mini"]) {
      expect(WIDGET_REGISTRY[type].datasets).toContain("installSlots");
    }
  });

  it("photo-* new widgets depend on photoByKind", () => {
    for (const type of ["photo-coverage-donut", "photo-kind-bar"]) {
      expect(WIDGET_REGISTRY[type].datasets).toContain("photoByKind");
    }
  });

  it("locations-bar shares the 'locations' swapGroup with top-locations", () => {
    expect(WIDGET_REGISTRY["locations-bar"].swapGroup).toBe("locations");
    expect(WIDGET_REGISTRY["top-locations"].swapGroup).toBe("locations");
  });

  it("data-coverage-summary declares every summary-shape dataset it renders", () => {
    const datasets = WIDGET_REGISTRY["data-coverage-summary"].datasets;
    expect(datasets).toEqual(
      expect.arrayContaining(["summary", "installSlots", "photoByKind", "metrics"])
    );
  });
});
