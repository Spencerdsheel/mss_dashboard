// Sprint 13b — drift guard (spec §4.2, required).
//
// Asserts Object.keys(WIDGET_REGISTRY) (sorted) equals the committed fixture
// services/common/allowed_widget_types.json. A pytest counterpart
// (backend_tests/test_allowed_widget_types.py) asserts the same fixture
// equals the backend's ALLOWED_WIDGET_TYPES frozenset. Either side drifting
// from the fixture fails CI instead of shipping a 422-the-admin-can't-explain
// or an unrenderable saved layout.

import { describe, expect, it } from "vitest";
import { WIDGET_REGISTRY } from "@/lib/widget-registry";
import allowedWidgetTypesFixture from "../services/common/allowed_widget_types.json";

describe("frontend WIDGET_REGISTRY <-> backend allowed_widget_types.json", () => {
  it("fixture is committed pre-sorted with no duplicates", () => {
    const fixture = allowedWidgetTypesFixture as string[];
    expect(fixture).toEqual([...fixture].sort());
    expect(new Set(fixture).size).toBe(fixture.length);
  });

  it("matches WIDGET_REGISTRY keys exactly (sorted)", () => {
    const registryKeys = Object.keys(WIDGET_REGISTRY).sort();
    const fixture = [...(allowedWidgetTypesFixture as string[])].sort();
    expect(registryKeys).toEqual(fixture);
  });

  // Sprint 19 — grew the universe from 8 to 22 v1 primitives (spec §4).
  it("has 27 renderable layout entries including Locations widgets", () => {
    const fixture = allowedWidgetTypesFixture as string[];
    expect(fixture).toHaveLength(27);
    expect(Object.keys(WIDGET_REGISTRY)).toHaveLength(27);
  });

  it("still contains the original 8 sprint 13a/14 types", () => {
    const original8 = [
      "banner-radar",
      "install-donuts",
      "kpi-execution-period",
      "kpi-install-slot",
      "kpi-total-visits",
      "photo-funnel",
      "top-locations",
      "visits-trend",
    ];
    for (const type of original8) {
      expect(WIDGET_REGISTRY).toHaveProperty(type);
    }
  });

  it("contains all 14 sprint 19 additions", () => {
    const new14 = [
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
    for (const type of new14) {
      expect(WIDGET_REGISTRY).toHaveProperty(type);
    }
  });
});
