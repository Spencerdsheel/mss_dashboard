// Acceptance baseline (Brasserie Labatt / Messi+Flying Fish)
export const EXPECTED_VISIT_COUNT = 436;
export const EXPECTED_UNIQUE_STORES = 436;
export const EXPECTED_DATE_START = "2026-03-06";
export const EXPECTED_DATE_END = "2026-04-08";
export const EXTRA_SURVEY_ID = "1737162";
export const ROWS_WITH_NO_PHOTOS = 3;

// Per-slot photo coverage. Keys must be exactly: STOREFRONT, PHOTO_1 … PHOTO_9.
// The generator in sample-data.ts consumes these to assign exactly this many
// photos per slot, and arranges exactly ROWS_WITH_NO_PHROWS (3) rows with no photos.
export const PHOTO_COUNTS: Record<string, number> = {
  STOREFRONT: 400,
  PHOTO_1: 390,
  PHOTO_2: 385,
  PHOTO_3: 370,
  PHOTO_4: 350,
  PHOTO_5: 330,
  PHOTO_6: 310,
  PHOTO_7: 290,
  PHOTO_8: 260,
  PHOTO_9: 230,
};

// Demo login credentials (shown on the login page)
export const DEMO_ADMIN_EMAIL = "admin@demo.local";
export const DEMO_CLIENT_EMAIL = "client-test1@demo.local";
export const DEMO_PASSWORD = "Demo123!";

// Demo project descriptor (used by the sample provider)
export const DEMO_CLIENT_NAME = "Brasserie Labatt";
export const DEMO_CLIENT_SLUG = "labatt";
export const DEMO_PROJECT_ID = "proj-labatt-messi-ff";
export const DEMO_PROJECT_NAME = "Messi and Flying Fish";
export const DEMO_PROJECT_SLUG = "messi-and-flying-fish";
