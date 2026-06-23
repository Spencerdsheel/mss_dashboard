export function buildTrendData(dates: string[]): { date: string; count: number }[] {
  if (dates.length === 0) return [];

  const counts = new Map<string, number>();
  for (const d of dates) {
    const day = d.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function installGridClass(slotCount: number): string {
  if (slotCount <= 2) return "lg:grid-cols-2";
  if (slotCount === 3) return "lg:grid-cols-3";
  return "lg:grid-cols-4";
}
