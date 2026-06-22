// T6 (frontend) — active-window visibility logic (P3-multi-project).
// Tests the pure helper extracted from src/app/dashboard/page.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isProjectActive } from "@/lib/projects";

function proj(start: string, end: string) {
  return { startDate: new Date(start), endDate: new Date(end) };
}

describe("isProjectActive", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is active when today is within the window", () => {
    expect(isProjectActive(proj("2026-03-01", "2026-04-08"))).toBe(true);
  });

  it("is inactive when today is before the start date", () => {
    expect(isProjectActive(proj("2026-03-16", "2026-04-08"))).toBe(false);
  });

  it("is inactive when today is after the end date", () => {
    expect(isProjectActive(proj("2026-01-01", "2026-03-14"))).toBe(false);
  });

  it("is active on exactly the start date (inclusive)", () => {
    expect(isProjectActive(proj("2026-03-15", "2026-04-08"))).toBe(true);
  });

  it("is active on exactly the end date (inclusive)", () => {
    expect(isProjectActive(proj("2026-02-01", "2026-03-15"))).toBe(true);
  });

  it("is active when start is far past and end is far future", () => {
    expect(isProjectActive(proj("2020-01-01", "2030-01-01"))).toBe(true);
  });

  it("is inactive for a single-day window in the past", () => {
    expect(isProjectActive(proj("2026-03-14", "2026-03-14"))).toBe(false);
  });

  it("is active for a single-day window of today", () => {
    expect(isProjectActive(proj("2026-03-15", "2026-03-15"))).toBe(true);
  });

  it("treats null dates as unbounded (always active)", () => {
    expect(isProjectActive({ startDate: null as any, endDate: null as any })).toBe(true);
  });
});
