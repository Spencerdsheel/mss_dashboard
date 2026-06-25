# Sprint 06 — Project page visual fixes (KPI height, pie layout, data checks)

> **Author:** Opus (planner). **Implementer:** Qwen 3.5 via opencode. **Verifier:** Sonnet.
> Read `qwen_implementation_guide.md` + `CLAUDE.md` first. Do **not** git-commit — the user does.

## 1. Goal

The project detail page has several visual issues: the Execution Period KPI card is taller than
others, pie charts are crowded when there are many install slots, and some charts show empty data
without explanation. After this sprint, KPI cards are uniform height, pie charts are 2-column max,
and data-empty states are handled gracefully.

## 2. Scope

**Edit these files:**
- `src/app/dashboard/projects/[projectId]/page.tsx` — KPI card height normalization
- `src/lib/chart-helpers.ts` — fix `installGridClass()` for less crowding
- `src/app/dashboard/projects/[projectId]/charts-section.tsx` — empty data handling for charts

**Do NOT touch:**
- Backend code, admin pages, login page, test files.
- Chart component internals (`src/components/charts/*`) — only the grid layout and data handling.

## 3. Implementation details

### 3a. KPI card uniform height

**File:** `src/app/dashboard/projects/[projectId]/page.tsx`, `Kpi` component (lines 133-168)

**Problem:** The Execution Period card uses `displayValue` (a long date string like
`"Mar 06, 2026 → Apr 08, 2026"`) which is wider/taller than the numeric KPI cards.

**Fix:** Differentiate styling when `displayValue` is used vs `AnimatedCounter`:

```tsx
<div className={cn(
  "mt-3",
  value !== null
    ? "kpi-number"                          // existing: large number
    : "font-space-grotesk text-base font-medium text-carbon"  // smaller for date strings
)} style={value !== null ? undefined : { letterSpacing: "-0.02em" }}>
  {value !== null ? <AnimatedCounter value={value} /> : displayValue}
</div>
```

Import `cn` from `@/lib/utils` if not already imported.

Additionally, add consistent min-height to all KPI cards. In the `Kpi` component's outer div:
```tsx
<div className="card-ventriloc p-5 flex flex-col justify-between min-h-[140px]">
```

### 3b. Pie chart grid — cap at 2 columns

**File:** `src/lib/chart-helpers.ts`, function `installGridClass()`

Current implementation likely returns `lg:grid-cols-4` for 4+ slots. Change to cap at 2 cols
on large screens and 3 on extra-large:

```ts
export function installGridClass(slotCount: number): string {
  if (slotCount <= 1) return "";
  if (slotCount === 2) return "lg:grid-cols-2";
  return "lg:grid-cols-2 xl:grid-cols-3";
}
```

This gives donuts more room and prevents cropping.

### 3c. Empty photo data handling (P3 slot)

**File:** `src/app/dashboard/projects/[projectId]/charts-section.tsx`

The "Photo Coverage by Slot" bar chart shows P3 as empty when `photoByKind["PHOTO_3"]` is 0.
This is correct behavior (no PHOTO_3 data exists for that project). However, slots with 0 photos
can be confusing. Add a visual indicator:

In the `photoData` memo (lines 41-55), filter out slots where count is 0 AND it's not a
"core" slot. Actually, keep all slots but the bar chart already renders zero-height bars. The
fix is to add a tooltip note when hovering on a zero bar. This is handled by Recharts tooltip.

**No code change needed for P3** — just verify the data is actually 0 and confirm this is
expected.

### 3d. "Visits over Time" chart data representation

**File:** `charts-section.tsx` — the `trendData` is built by `buildTrendData()`.

**Verification needed:** Run the app and check if:
1. The dates on the X-axis are spread across the full execution period
2. Visit counts per day look reasonable (not all bunched on one date)
3. If all visits have the same date, the chart will look like a single spike — this is a data
   issue, not a chart bug

If the chart looks wrong because dates are clustering, the fix is in `buildTrendData()` — it
should fill in zero-count days between min and max date to create a smooth timeline. Check if
`buildTrendData` already does gap-filling. If not, add it:

```ts
export function buildTrendData(dates: string[]): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const day = d.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  
  const sorted = Array.from(counts.keys()).sort();
  if (sorted.length < 2) return sorted.map(d => ({ date: d, count: counts.get(d)! }));
  
  // Fill gaps with zero-count days
  const result: Array<{ date: string; count: number }> = [];
  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    result.push({ date: iso, count: counts.get(iso) ?? 0 });
  }
  return result;
}
```

**Important:** Only modify `buildTrendData` if the existing implementation does NOT already
fill gaps. Check the existing code in `chart-helpers.ts` first. If the chart-helpers test
(`tests/chart-helpers.test.ts`) asserts specific output, match its expectations.

## 4. Red lines

- **Workbook parity (CLAUDE.md §5, `.claude/rules/workbook-parity.md`):** Do NOT modify sample
  data counts. The 436 visits, photo distributions, etc. must remain exactly as they are.
- **No test edits:** Tests define the contract. If `chart-helpers.test.ts` asserts something,
  make the code match the test.

## 5. Verification gates

```bash
# frontend
npx tsc --noEmit
npm run lint
npm test

# visual verification (npm run dev + backend running)
# 1. All 4 KPI cards are the same height
# 2. Pie charts display in 2-column layout on large screens
# 3. Project with no metrics shows empty-state message (sprint-05)
# 4. Visits over Time chart shows a reasonable spread of dates
```

## 6. Definition of done

- [ ] All verification gates green.
- [ ] KPI cards are uniform height.
- [ ] Pie charts use 2-col (lg) / 3-col (xl) grid instead of 4-col.
- [ ] `chart-helpers.ts` test still passes.
- [ ] No data or sample counts modified.
- [ ] No git operations performed.
