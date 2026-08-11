// Sprint 16 §4.4: pure pathname -> breadcrumb-label mapping for the header's
// "Dashboard / <current page>" text. Kept deliberately two-level (no deep
// multi-segment trail) per the sprint's explicit instruction. Framework-free
// so it's directly unit-testable (see tests/breadcrumb.test.ts).

const STATIC_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^\/dashboard\/projects\/[^/]+\/locations\/?$/, label: "Locations" },
  { pattern: /^\/dashboard\/projects\/[^/]+\/visits\/[^/]+\/?$/, label: "Visit Details" },
  { pattern: /^\/dashboard\/projects\/[^/]+\/visits\/?$/, label: "Visits" },
  { pattern: /^\/dashboard\/projects\/[^/]+\/?$/, label: "Overview" },
  { pattern: /^\/dashboard\/?$/, label: "All Projects" },
  { pattern: /^\/admin\/users\/?/, label: "Manage Users" },
  { pattern: /^\/admin\/projects\/?/, label: "Admin Projects" },
  { pattern: /^\/admin\/photo-slots\/?/, label: "Photo Slots" },
  { pattern: /^\/admin\/metrics\/?/, label: "Metric Targets" },
  { pattern: /^\/admin\/companies\/?/, label: "Companies" },
  { pattern: /^\/admin\/connections\/?/, label: "Connections" },
  { pattern: /^\/admin\/runs\/?/, label: "Run History" },
  { pattern: /^\/admin\/settings\/?/, label: "Settings" },
  { pattern: /^\/settings\/?/, label: "Settings" },
];

/** Maps a pathname to the second breadcrumb segment ("Dashboard / <label>"). */
export function breadcrumbLabelFor(pathname: string): string {
  if (!pathname) return "Dashboard";
  for (const { pattern, label } of STATIC_LABELS) {
    if (pattern.test(pathname)) return label;
  }
  return "Dashboard";
}
