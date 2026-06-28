// T6 (frontend) — chart data helpers (P3-charts).
// Tests the pure helpers extracted from charts-section.tsx.

import { describe, expect, it } from "vitest";
import { buildTrendData, installGridClass } from "@/lib/chart-helpers";

describe("buildTrendData", () => {
  it("returns [] for no visits", () => {
    expect(buildTrendData([])).toEqual([]);
  });

  it("counts a single visit on a single day", () => {
    expect(buildTrendData(["2026-03-15"])).toEqual([{ date: "2026-03-15", count: 1 }]);
  });

  it("aggregates multiple visits on the same day", () => {
    const out = buildTrendData(["2026-03-15", "2026-03-15", "2026-03-15"]);
    expect(out).toEqual([{ date: "2026-03-15", count: 3 }]);
  });

  it("sorts distinct days chronologically", () => {
    const out = buildTrendData(["2026-03-17", "2026-03-15", "2026-03-16", "2026-03-15"]);
    expect(out).toEqual([
      { date: "2026-03-15", count: 2 },
      { date: "2026-03-16", count: 1 },
      { date: "2026-03-17", count: 1 },
    ]);
  });

  it("uses only the YYYY-MM-DD prefix of ISO timestamps", () => {
    expect(buildTrendData(["2026-03-15T09:00:00Z", "2026-03-15T18:30:00Z"])).toEqual([
      { date: "2026-03-15", count: 2 },
    ]);
  });
});

describe("installGridClass", () => {
  it("1 slot → no extra class", () => {
    expect(installGridClass(1)).toBe("");
  });
  it("2 slots → 2 columns", () => {
    expect(installGridClass(2)).toBe("lg:grid-cols-2");
  });
  it("3 slots → 2 cols", () => {
    expect(installGridClass(3)).toBe("lg:grid-cols-2");
  });
  it("4 slots → 2 cols", () => {
    expect(installGridClass(4)).toBe("lg:grid-cols-2");
  });
  it("more than 4 slots clamps to 2 cols", () => {
    expect(installGridClass(5)).toBe("lg:grid-cols-2");
  });
});
