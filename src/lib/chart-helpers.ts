export function buildTrendData(dates: string[]): { date: string; count: number }[] {
  if (dates.length === 0) return [];

  const counts = new Map<string, number>();
  for (const d of dates) {
    const day = d.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const sorted = Array.from(counts.keys()).sort();
  if (sorted.length < 2) return sorted.map((d) => ({ date: d, count: counts.get(d)! }));

  // Fill gaps with zero-count days for a smooth timeline
  const result: { date: string; count: number }[] = [];
  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    result.push({ date: iso, count: counts.get(iso) ?? 0 });
  }
  return result;
}

export function installGridClass(slotCount: number): string {
  if (slotCount <= 1) return "";
  return "lg:grid-cols-2";
}
