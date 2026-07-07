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
  if (slotCount === 2) return "lg:grid-cols-2";
  return "lg:grid-cols-3";
}

const PHOTO_SLOT_ORDER = [
  "STOREFRONT", "PHOTO_1", "PHOTO_2", "PHOTO_3", "PHOTO_4",
  "PHOTO_5", "PHOTO_6", "PHOTO_7", "PHOTO_8", "PHOTO_9",
];

const PHOTO_SLOT_LABELS: Record<string, string> = {
  STOREFRONT: "Storefront",
  PHOTO_1: "P1", PHOTO_2: "P2", PHOTO_3: "P3", PHOTO_4: "P4",
  PHOTO_5: "P5", PHOTO_6: "P6", PHOTO_7: "P7", PHOTO_8: "P8", PHOTO_9: "P9",
};

const FUNNEL_COLORS = [
  "#4a90d9", "#5a95d4", "#6a9acf", "#7a9fca", "#8aa4c5",
  "#9aa9c0", "#b09070", "#c07850", "#e06030", "#ff682c",
];

export function buildFunnelData(
  photoByKind: Record<string, number>
): Array<{ name: string; value: number; pct: string; fill: string }> {
  const topValue = photoByKind["STOREFRONT"] ?? 0;
  return PHOTO_SLOT_ORDER.map((key, i) => {
    const value = photoByKind[key] ?? 0;
    const pct = topValue > 0 ? `${Math.round((value / topValue) * 100)}%` : "0%";
    return { name: PHOTO_SLOT_LABELS[key] ?? key, value, pct, fill: FUNNEL_COLORS[i] };
  }).sort((a, b) => b.value - a.value);
}

const MULTI_WORD_BANNERS = [
  "Super C", "Couche-Tard", "Marché Richelieu", "Marche Richelieu",
  "Jean Coutu", "Dollarama Plus", "Food Basics",
];

export function extractBanner(storeName: string): string {
  const lower = storeName.toLowerCase();
  for (const b of MULTI_WORD_BANNERS) {
    if (lower.startsWith(b.toLowerCase())) return b;
  }
  return storeName.split(/\s+/)[0] ?? storeName;
}

export function buildRadarData(
  rows: Array<{
    storeName: string | null;
    install1: string | null;
    install2: string | null;
    install3: string | null;
    photoCount: number;
  }>,
  installSlots: Array<{
    slot_index: number;
    distribution: Array<{ label: string; is_success: boolean }>;
  }>
): {
  radarData: Array<{ metric: string; [banner: string]: string | number }>;
  banners: string[];
} {
  const bannerMap = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.storeName) continue;
    const banner = extractBanner(r.storeName);
    if (!bannerMap.has(banner)) bannerMap.set(banner, []);
    bannerMap.get(banner)!.push(r);
  }

  const sorted = Array.from(bannerMap.entries())
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 6);
  const banners = sorted.map(([name]) => name);

  const successLabels: Set<string>[] = [];
  for (let i = 0; i < 3; i++) {
    const slot = installSlots.find((s) => s.slot_index === i + 1);
    successLabels.push(
      new Set(slot?.distribution.filter((d) => d.is_success).map((d) => d.label) ?? [])
    );
  }

  const maxVisits = Math.max(1, ...sorted.map(([, r]) => r.length));

  const metrics = ["Visits", "Install 1", "Install 2", "Install 3", "Photos"];
  const radarData = metrics.map((metric) => {
    const entry: { metric: string; [banner: string]: string | number } = { metric };
    for (const [banner, bRows] of sorted) {
      if (metric === "Visits") {
        entry[banner] = Math.round((bRows.length / maxVisits) * 100);
      } else if (metric === "Photos") {
        const avg = bRows.reduce((s, r) => s + r.photoCount, 0) / bRows.length;
        entry[banner] = Math.round((avg / 10) * 100);
      } else {
        const idx = parseInt(metric.split(" ")[1]) - 1;
        const field = `install${idx + 1}` as "install1" | "install2" | "install3";
        const labels = successLabels[idx];
        const successes = bRows.filter((r) => r[field] && labels.has(r[field]!)).length;
        entry[banner] = bRows.length > 0 ? Math.round((successes / bRows.length) * 100) : 0;
      }
    }
    return entry;
  });

  return { radarData, banners };
}

export const BAR_GRADIENT_LIGHT = [
  "#d94f1e", "#df5722", "#e56026", "#eb682a", "#f0702e",
  "#f57832", "#fa8036", "#ff883a", "#ffa06e", "#ffc3a3",
];

export const BAR_GRADIENT_DARK = [
  "#ff8a5c", "#ff8254", "#ff7a4c", "#ff7244", "#ff6a3c",
  "#ff6234", "#e0562c", "#c04a24", "#a03e1c", "#8a3b1c",
];
