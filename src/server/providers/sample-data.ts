// Deterministic, reproducible generator that emits a normalized sample dataset
// matching the workbook's exact aggregate facts:
//
//   - 436 visits across 436 unique stores
//   - date range 2026-03-06 .. 2026-04-08
//   - Install 1 / 2 / 3 distributions exactly as specified
//   - photo coverage per-slot exactly as specified
//   - exactly 3 rows with no photos
//   - survey id `1737162` is present
//
// The generator is pure and seeded — running it twice produces identical data.
// It lives behind the DashboardDataProvider contract so the UI doesn't depend
// on Excel parsing.

import {
  EXPECTED_VISIT_COUNT,
  EXPECTED_DATE_START,
  EXPECTED_DATE_END,
  EXTRA_SURVEY_ID,
  PHOTO_COUNTS,
  ROWS_WITH_NO_PHOTOS,
} from "@/lib/constants";

// P1.4: Install distributions now come from campaign config in DB.
// Sample provider uses simplified hardcoded distributions.
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
import type { NormalizedVisit } from "./types";

// ── tiny deterministic PRNG (mulberry32) ────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Canadian city pool (plausible Brasserie Labatt territory) ───────────────
const CITIES: Array<{ city: string; province: string }> = [
  { city: "Montréal", province: "QC" },
  { city: "Québec", province: "QC" },
  { city: "Laval", province: "QC" },
  { city: "Gatineau", province: "QC" },
  { city: "Longueuil", province: "QC" },
  { city: "Sherbrooke", province: "QC" },
  { city: "Trois-Rivières", province: "QC" },
  { city: "Saguenay", province: "QC" },
  { city: "Lévis", province: "QC" },
  { city: "Terrebonne", province: "QC" },
  { city: "Saint-Jean-sur-Richelieu", province: "QC" },
  { city: "Repentigny", province: "QC" },
  { city: "Brossard", province: "QC" },
  { city: "Drummondville", province: "QC" },
  { city: "Saint-Jérôme", province: "QC" },
  { city: "Granby", province: "QC" },
  { city: "Blainville", province: "QC" },
  { city: "Saint-Hyacinthe", province: "QC" },
  { city: "Shawinigan", province: "QC" },
  { city: "Rimouski", province: "QC" },
  { city: "Toronto", province: "ON" },
  { city: "Ottawa", province: "ON" },
  { city: "Mississauga", province: "ON" },
  { city: "Hamilton", province: "ON" },
  { city: "London", province: "ON" },
  { city: "Kitchener", province: "ON" },
  { city: "Windsor", province: "ON" },
  { city: "Sudbury", province: "ON" },
];

const BANNERS = [
  "IGA",
  "Metro",
  "Provigo",
  "Super C",
  "Maxi",
  "Loblaws",
  "Sobeys",
  "Adonis",
  "Dépanneur",
  "Marché Richelieu",
  "Couche-Tard",
];

const STREETS = [
  "Boulevard Saint-Laurent",
  "Rue Sainte-Catherine",
  "Avenue du Parc",
  "Boulevard René-Lévesque",
  "Rue Sherbrooke",
  "Avenue Laurier",
  "Rue Notre-Dame",
  "Boulevard Taschereau",
  "Chemin Queen Mary",
  "Rue Saint-Denis",
  "King Street",
  "Queen Street",
  "Yonge Street",
  "Bank Street",
];

const CLERK_FIRST = [
  "Marie",
  "Jean",
  "Sophie",
  "Luc",
  "Isabelle",
  "Pierre",
  "Catherine",
  "François",
  "Nathalie",
  "Éric",
  "Julie",
  "Mathieu",
  "Stéphanie",
  "Olivier",
  "Claire",
  "Ahmed",
  "Priya",
  "Kim",
  "Raj",
];
const CLERK_LAST = [
  "Tremblay",
  "Gagnon",
  "Roy",
  "Côté",
  "Bouchard",
  "Gauthier",
  "Morin",
  "Lavoie",
  "Fortin",
  "Gagné",
  "Ouellet",
  "Pelletier",
  "Bélanger",
  "Lévesque",
  "Bergeron",
  "Leblanc",
];

const NOTES_POOL: (string | null)[] = [
  null,
  null,
  null,
  null,
  "Gérant très coopératif, visite efficace.",
  "Espace limité en entrée, installation ajustée.",
  "Standee déplacé en cours de journée par le personnel.",
  "Flying Fish bien visible près des caisses.",
  "Rupture de stock partielle observée.",
  "Magasin très achalandé pendant la visite.",
  "Personnel intéressé par les produits.",
  "Installation complète selon planogramme.",
  "Demande d'affichage supplémentaire notée.",
];

// ── Expand distribution map to a flat array of length EXPECTED_VISIT_COUNT ─
function expandDistribution(
  counts: Record<string, number>,
  total: number
): string[] {
  const out: string[] = [];
  for (const [value, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) out.push(value);
  }
  if (out.length !== total) {
    throw new Error(
      `Distribution total mismatch: expected ${total}, got ${out.length}`
    );
  }
  return out;
}

// Build the array of visit dates spanning start..end (inclusive) with 436 slots
function buildVisitDates(
  startISO: string,
  endISO: string,
  total: number
): Date[] {
  const start = new Date(`${startISO}T00:00:00Z`).getTime();
  const end = new Date(`${endISO}T00:00:00Z`).getTime();
  const days: Date[] = [];
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    days.push(new Date(t));
  }
  // Distribute 436 visits across the window. Guarantee start and end dates
  // are both used at least once (so the observed range matches exactly).
  const out: Date[] = [];
  out.push(new Date(start));
  out.push(new Date(end));
  const remaining = total - 2;
  for (let i = 0; i < remaining; i++) {
    out.push(days[i % days.length]);
  }
  // Sort ascending for stable assignment
  out.sort((a, b) => a.getTime() - b.getTime());
  return out;
}

function timeForIndex(rnd: () => number): string {
  const hour = 9 + Math.floor(rnd() * 10); // 09:00..18:59
  const min = Math.floor(rnd() * 60);
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function generateSampleVisits(): NormalizedVisit[] {
  const total = EXPECTED_VISIT_COUNT;
  const rnd = mulberry32(20260306);

  // Build exact install distributions, then shuffle so assignment is plausible
  const install1 = shuffle(expandDistribution(INSTALL1_COUNTS, total), rnd);
  const install2 = shuffle(expandDistribution(INSTALL2_COUNTS, total), rnd);
  const install3 = shuffle(expandDistribution(INSTALL3_COUNTS, total), rnd);

  // Photo presence masks: for each slot, pick exactly N indices to be non-null.
  // Additionally, guarantee exactly ROWS_WITH_NO_PHOTOS rows end up with zero
  // photos across every slot.
  const slotKeys = [
    "STOREFRONT",
    "PHOTO_1",
    "PHOTO_2",
    "PHOTO_3",
    "PHOTO_4",
    "PHOTO_5",
    "PHOTO_6",
    "PHOTO_7",
    "PHOTO_8",
    "PHOTO_9",
  ] as const;

  const noPhotoRows = new Set<number>();
  // Pick deterministic rows forced to have zero photos
  const allIdx = Array.from({ length: total }, (_, i) => i);
  const shuffledAll = shuffle(allIdx, rnd);
  for (let i = 0; i < ROWS_WITH_NO_PHOTOS; i++) noPhotoRows.add(shuffledAll[i]);

  // Candidate indices (everyone NOT in noPhotoRows) — used first for each slot
  const candidateIdx = allIdx.filter((i) => !noPhotoRows.has(i));

  const photoMasks: Record<(typeof slotKeys)[number], Set<number>> = {
    STOREFRONT: new Set(),
    PHOTO_1: new Set(),
    PHOTO_2: new Set(),
    PHOTO_3: new Set(),
    PHOTO_4: new Set(),
    PHOTO_5: new Set(),
    PHOTO_6: new Set(),
    PHOTO_7: new Set(),
    PHOTO_8: new Set(),
    PHOTO_9: new Set(),
  };

  for (const slot of slotKeys) {
    const want = PHOTO_COUNTS[slot];
    if (want === 0) continue;
    if (want > candidateIdx.length) {
      throw new Error(
        `Photo slot ${slot} requests ${want}, only ${candidateIdx.length} rows eligible`
      );
    }
    const picked = shuffle(candidateIdx, rnd).slice(0, want);
    photoMasks[slot] = new Set(picked);
  }

  // Sanity: noPhotoRows must have zero photos across all slots
  for (const i of noPhotoRows) {
    for (const slot of slotKeys) {
      if (photoMasks[slot].has(i)) {
        throw new Error(`Invariant broken: row ${i} is a no-photo row but slot ${slot} has it`);
      }
    }
  }

  const visitDates = buildVisitDates(
    EXPECTED_DATE_START,
    EXPECTED_DATE_END,
    total
  );

  // Build visits
  const visits: NormalizedVisit[] = [];
  const usedStoreIds = new Set<string>();

  // Ensure EXTRA_SURVEY_ID appears in the dataset (index 0)
  const surveyIdPool: string[] = [];
  surveyIdPool.push(EXTRA_SURVEY_ID);
  let nextSid = 1700000;
  while (surveyIdPool.length < total) {
    nextSid += 1 + Math.floor(rnd() * 37);
    if (String(nextSid) === EXTRA_SURVEY_ID) continue;
    surveyIdPool.push(String(nextSid));
  }

  for (let i = 0; i < total; i++) {
    const city = CITIES[Math.floor(rnd() * CITIES.length)];
    const banner = BANNERS[Math.floor(rnd() * BANNERS.length)];
    // stable unique store id: BL-{i+1000}
    let storeId = `BL-${1000 + i}`;
    while (usedStoreIds.has(storeId)) storeId = `BL-${1000 + i}-${Math.floor(rnd() * 999)}`;
    usedStoreIds.add(storeId);

    const streetNum = 100 + Math.floor(rnd() * 9800);
    const street = STREETS[Math.floor(rnd() * STREETS.length)];
    const address = `${streetNum} ${street}`;
    const clerkName = `${CLERK_FIRST[Math.floor(rnd() * CLERK_FIRST.length)]} ${CLERK_LAST[Math.floor(rnd() * CLERK_LAST.length)]}`;

    const photoUrl = (slot: string) =>
      `https://picsum.photos/seed/${storeId}-${slot}/800/600`;

    const visit: NormalizedVisit = {
      surveyId: surveyIdPool[i],
      storeId,
      storeName: `${banner} ${city.city} #${storeId.slice(-4)}`,
      address,
      city: city.city,
      visitDate: visitDates[i],
      visitTime: timeForIndex(rnd),
      clerkName,
      install1: install1[i],
      install2: install2[i],
      install3: install3[i],
      install4: null,
      storefrontUrl: photoMasks.STOREFRONT.has(i) ? photoUrl("STOREFRONT") : null,
      photo1: photoMasks.PHOTO_1.has(i) ? photoUrl("PHOTO_1") : null,
      photo2: photoMasks.PHOTO_2.has(i) ? photoUrl("PHOTO_2") : null,
      photo3: photoMasks.PHOTO_3.has(i) ? photoUrl("PHOTO_3") : null,
      photo4: photoMasks.PHOTO_4.has(i) ? photoUrl("PHOTO_4") : null,
      photo5: photoMasks.PHOTO_5.has(i) ? photoUrl("PHOTO_5") : null,
      photo6: photoMasks.PHOTO_6.has(i) ? photoUrl("PHOTO_6") : null,
      photo7: photoMasks.PHOTO_7.has(i) ? photoUrl("PHOTO_7") : null,
      photo8: photoMasks.PHOTO_8.has(i) ? photoUrl("PHOTO_8") : null,
      photo9: photoMasks.PHOTO_9.has(i) ? photoUrl("PHOTO_9") : null,
      overallNotes: NOTES_POOL[Math.floor(rnd() * NOTES_POOL.length)],
    };

    visits.push(visit);
  }

  return visits;
}
