// Stable provider contract. The UI/services MUST depend on this interface,
// never on file-parsing code or vendor API clients directly.

export type NormalizedVisit = {
  surveyId: string;
  storeId: string;
  storeName: string;
  address: string | null;
  city: string | null;
  visitDate: Date;
  visitTime: string | null;
  clerkName: string | null;
  install1: string | null;
  install2: string | null;
  install3: string | null;
  install4: string | null;
  storefrontUrl: string | null;
  photo1: string | null;
  photo2: string | null;
  photo3: string | null;
  photo4: string | null;
  photo5: string | null;
  photo6: string | null;
  photo7: string | null;
  photo8: string | null;
  photo9: string | null;
  overallNotes: string | null;
  photoCount?: number;
};

export type ProjectDescriptor = {
  clientName: string;
  clientSlug: string;
  projectName: string;
  projectSlug: string;
  locale: string;
  startDate: Date;
  endDate: Date;
};

export type ProjectMetric = {
  key: string;
  label: string;
  value: number;
  unit?: string | null;
  category?: string | null;
};

export type ProjectListItem = {
  id: string;
  name: string;
  clientName: string;
  clientSlug: string;
  projectName: string;
  projectSlug: string;
  startDate: Date;
  endDate: Date;
  providerKind: "sample" | "shopmetrics" | "rest-api";
  visitCount?: number;
};

export type PaginatedVisitItem = {
  instance_id: string;
  store_id: string;
  store_name: string;
  visit_date: string;
  city: string | null;
  address: string | null;
  clerk_name: string | null;
  install1: string | null;
  install2: string | null;
  install3: string | null;
  overall_notes: string | null;
  photo_count: number;
};

export type PaginatedVisitsResult = {
  items: PaginatedVisitItem[];
  next_cursor: string | null;
  prev_cursor: string | null;
  total_count: number;
  filter_options: {
    cities: string[];
    install1_values: string[];
    install2_values: string[];
    install3_values: string[];
  };
};

export interface DashboardDataProvider {
  /** Provider identifier (sample | shopmetrics | rest-api). */
  readonly kind: "sample" | "shopmetrics" | "rest-api";

  /** High-level description of the project this provider serves. */
  describeProject(): Promise<ProjectDescriptor>;

  /** Seeded reference metrics (targets, denominators). */
  listProjectMetrics(): Promise<ProjectMetric[]>;

  /** @deprecated Use listVisitsPaginated for paginated access. */
  listVisits(): Promise<NormalizedVisit[]>;

  /** Paginated visit list with server-side sort/filter/search. */
  listVisitsPaginated(params: {
    cursor?: string;
    limit?: number;
    sort?: string;
    dir?: "asc" | "desc";
    search?: string;
    filters?: Record<string, string | undefined>;
  }): Promise<PaginatedVisitsResult>;

  /**
   * Single visit detail with photos populated.
   * Returns null when not found so callers can notFound() cleanly.
   */
  getVisit(surveyId: string): Promise<NormalizedVisit | null>;

  /**
   * Photo URLs for a single visit, keyed by slot kind.
   * Each entry has a `kind` (e.g. "STOREFRONT", "PHOTO_1"…"PHOTO_9") and a
   * CDN `url`. URLs must be used as-is — no byte proxying.
   */
  listPhotos(surveyId: string): Promise<Array<{ kind: string; url: string }>>;

  /** List projects visible to the current user. */
  listProjects(): Promise<ProjectListItem[]>;
}
