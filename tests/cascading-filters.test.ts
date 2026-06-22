// T6 (frontend) — cascading dependent filters (P3-cascading-filters).
// Tests the pure helpers extracted from the Visits table.

import { describe, expect, it } from "vitest";
import { ALL, cascadingOptions, rowsExcluding, type ActiveFilters } from "@/lib/cascading-filters";

const rows = [
  { city: "Montreal", install1: "Installed", install2: "Yes", install3: null },
  { city: "Montreal", install1: "Refused", install2: "No", install3: null },
  { city: "Toronto", install1: "Installed", install2: "Yes", install3: null },
  { city: "Toronto", install1: "Refused", install2: "No", install3: null },
  { city: "Ottawa", install1: "Installed", install2: "Yes", install3: null },
];

const none: ActiveFilters = { city: ALL, i1: ALL, i2: ALL, i3: ALL };

describe("rowsExcluding", () => {
  it("returns all rows when no filters are active", () => {
    expect(rowsExcluding(rows, none, "city")).toHaveLength(5);
  });

  it("applies the city filter when computing install-1 options (skip=i1)", () => {
    const base = rowsExcluding(rows, { ...none, city: "Montreal" }, "i1");
    expect(base).toHaveLength(2);
    expect(base.every((r) => r.city === "Montreal")).toBe(true);
  });

  it("ignores the skipped dimension's own selection", () => {
    // city is selected but skip='city' → city filter is NOT applied
    const base = rowsExcluding(rows, { ...none, city: "Montreal", i1: "Installed" }, "city");
    expect(base).toHaveLength(3);
    expect(base.every((r) => r.install1 === "Installed")).toBe(true);
  });
});

describe("cascadingOptions", () => {
  it("returns all unique cities sorted when nothing is filtered", () => {
    const opts = cascadingOptions(rowsExcluding(rows, none, "city"), "city", ALL);
    expect(opts).toEqual(["Montreal", "Ottawa", "Toronto"]);
  });

  it("narrows install-1 options to the selected city", () => {
    const filters: ActiveFilters = { ...none, city: "Ottawa" };
    const opts = cascadingOptions(rowsExcluding(rows, filters, "i1"), "install1", ALL);
    expect(opts).toEqual(["Installed"]); // Ottawa only has an "Installed" row
  });

  it("always includes the current value even if other filters would exclude it", () => {
    // city=Ottawa leaves only install1=Installed, but i1 is currently 'Refused'
    const filters: ActiveFilters = { ...none, city: "Ottawa", i1: "Refused" };
    const opts = cascadingOptions(rowsExcluding(rows, filters, "i1"), "install1", "Refused");
    expect(opts).toContain("Refused");
    expect(opts).toContain("Installed");
  });

  it("dependent narrowing: city=Montreal limits install1 options to Montreal's values", () => {
    const filters: ActiveFilters = { ...none, city: "Montreal" };
    const opts = cascadingOptions(rowsExcluding(rows, filters, "i1"), "install1", ALL);
    expect(opts).toEqual(["Installed", "Refused"]);
  });
});
