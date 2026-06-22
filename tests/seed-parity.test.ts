// Workbook-parity assertions. These run against the deterministic generator
// (no DB required) and are the mechanical contract behind
// `.claude/skills/workbook-parity-check.md`.
//
// P1.4: Install distributions now come from campaign config in DB.
// Parity tests use simplified English distributions matching the sample provider.

import { describe, expect, it } from "vitest";
import { generateSampleVisits } from "@/server/providers/sample-data";
import {
  EXPECTED_DATE_END,
  EXPECTED_DATE_START,
  EXPECTED_UNIQUE_STORES,
  EXPECTED_VISIT_COUNT,
  EXTRA_SURVEY_ID,
  PHOTO_COUNTS,
  ROWS_WITH_NO_PHOTOS,
} from "@/lib/constants";

// P1.4: Install distributions defined locally (matching sample-data.ts)
const INSTALL1_COUNTS: Record<string, number> = {
  "Installed in B4 position": 265,
  "Installed elsewhere": 116,
  "Assembled in backroom": 24,
  "Given to an employee": 23,
  "Store closed": 5,
  "Refused": 2,
  "Not targeted": 1,
};

const INSTALL2_COUNTS: Record<string, number> = {
  "Installed in 360 position": 266,
  "Installed elsewhere": 56,
  "Assembled in backroom": 52,
  "Not targeted": 38,
  "Given to an employee": 12,
  "Refused": 7,
  "Store closed": 5,
};

const INSTALL3_COUNTS: Record<string, number> = {
  "Fully stocked": 216,
  "Not stocked": 85,
  "Partially stocked": 52,
  "Not targeted": 39,
  "Not assembled": 32,
  "Refused": 7,
  "Store closed": 5,
};

const visits = generateSampleVisits();

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function tallyBy<T extends keyof (typeof visits)[number]>(key: T) {
  const map = new Map<string, number>();
  for (const v of visits) {
    const k = (v[key] ?? "(null)") as string;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Object.fromEntries(map);
}

describe("workbook parity — totals", () => {
  it("has exactly 436 visits", () => {
    expect(visits.length).toBe(EXPECTED_VISIT_COUNT);
  });

  it("has 436 unique stores", () => {
    const unique = new Set(visits.map((v) => v.storeId));
    expect(unique.size).toBe(EXPECTED_UNIQUE_STORES);
  });

  it("has unique survey IDs", () => {
    const unique = new Set(visits.map((v) => v.surveyId));
    expect(unique.size).toBe(visits.length);
  });

  it("covers the exact date range 2026-03-06 → 2026-04-08", () => {
    const dates = visits.map((v) => v.visitDate).sort((a, b) => a.getTime() - b.getTime());
    expect(toISODate(dates[0])).toBe(EXPECTED_DATE_START);
    expect(toISODate(dates[dates.length - 1])).toBe(EXPECTED_DATE_END);
  });

  it("preserves survey ID 1737162", () => {
    expect(visits.some((v) => v.surveyId === EXTRA_SURVEY_ID)).toBe(true);
  });
});

describe("workbook parity — install distributions", () => {
  it("Install 1 distribution matches", () => {
    expect(tallyBy("install1")).toEqual(INSTALL1_COUNTS);
  });
  it("Install 2 distribution matches", () => {
    expect(tallyBy("install2")).toEqual(INSTALL2_COUNTS);
  });
  it("Install 3 distribution matches", () => {
    expect(tallyBy("install3")).toEqual(INSTALL3_COUNTS);
  });
});

describe("workbook parity — photo coverage", () => {
  const slotExtractors: Record<string, (v: any) => string | null> = {
    STOREFRONT: (v) => v.storefrontUrl,
    PHOTO_1: (v) => v.photo1,
    PHOTO_2: (v) => v.photo2,
    PHOTO_3: (v) => v.photo3,
    PHOTO_4: (v) => v.photo4,
    PHOTO_5: (v) => v.photo5,
    PHOTO_6: (v) => v.photo6,
    PHOTO_7: (v) => v.photo7,
    PHOTO_8: (v) => v.photo8,
    PHOTO_9: (v) => v.photo9,
  };

  for (const [slot, expected] of Object.entries(PHOTO_COUNTS)) {
    it(`slot ${slot} has ${expected} photos`, () => {
      const count = visits.filter((v) => slotExtractors[slot](v)).length;
      expect(count).toBe(expected);
    });
  }

  it("has exactly 3 rows with no photos at all", () => {
    const noPhoto = visits.filter((v) =>
      Object.keys(slotExtractors).every((s) => !slotExtractors[s](v))
    );
    expect(noPhoto.length).toBe(ROWS_WITH_NO_PHOTOS);
  });
});

describe("provider contract", () => {
  it("every visit has a non-empty survey ID, store ID, and store name", () => {
    for (const v of visits) {
      expect(v.surveyId.length).toBeGreaterThan(0);
      expect(v.storeId.length).toBeGreaterThan(0);
      expect(v.storeName.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic — running the generator twice yields identical output", () => {
    const a = generateSampleVisits();
    const b = generateSampleVisits();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].surveyId).toBe(b[i].surveyId);
      expect(a[i].storeId).toBe(b[i].storeId);
      expect(a[i].install1).toBe(b[i].install1);
      expect(a[i].install2).toBe(b[i].install2);
      expect(a[i].install3).toBe(b[i].install3);
      expect(a[i].storefrontUrl).toBe(b[i].storefrontUrl);
    }
  });
});
