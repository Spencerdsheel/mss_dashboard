import type {
  DashboardDataProvider,
  NormalizedVisit,
  PaginatedVisitsResult,
  ProjectDescriptor,
  ProjectMetric,
  ProjectListItem,
} from "./types";
import { backendGet } from "../backend-api";

/** Shape returned by GET /projects/{id}/visits/{instance_id} */
type BackendVisitDetail = {
  instance_id: string;
  store_id: string;
  store_name: string;
  visit_date: string;
  visit_time: string | null;
  city: string | null;
  address: string | null;
  clerk_name: string | null;
  install1: string | null;
  install2: string | null;
  install3: string | null;
  install4: string | null;
  overall_notes: string | null;
};

/** Shape of each item returned by GET /projects/{id}/visits/{instance_id}/photos */
type BackendPhoto = {
  instance_id: string;
  kind: string;
  url: string;
  caption: string | null;
};

export type VisitFilters = {
  city?: string;
  install1?: string;
  install2?: string;
  install3?: string;
};

export type PaginatedVisitsResponse = {
  items: Array<{
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
  }>;
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

export class RestApiProvider implements DashboardDataProvider {
  readonly kind = "rest-api" as const;

  constructor(
    private baseUrl: string,
    private token: string,
    private projectId: string
  ) {}

  async describeProject(): Promise<ProjectDescriptor> {
    const summary = await backendGet<{
      project_id: string;
      total_visits: number;
      unique_stores: number;
      min_date: string;
      max_date: string;
      client_name: string;
    }>(
      `/projects/${this.projectId}/summary`,
      this.token,
      { tags: [`project:${this.projectId}`], revalidate: 120 }
    );

    return {
      clientName: summary.client_name || "Brasserie Labatt",
      clientSlug: "brasserie-labatt",
      projectName: "Messi and Flying Fish",
      projectSlug: "messi-flying-fish",
      locale: "fr-CA",
      startDate: new Date(summary.min_date),
      endDate: new Date(summary.max_date),
    };
  }

  async listProjectMetrics(): Promise<ProjectMetric[]> {
    const summary = await backendGet<{
      metrics: Array<{
        key: string;
        label: string;
        value: number;
        unit?: string;
        category?: string;
      }>;
    }>(
      `/projects/${this.projectId}/summary`,
      this.token,
      { tags: [`project:${this.projectId}`], revalidate: 120 }
    );

    return summary.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      value: m.value,
      unit: m.unit || null,
      category: m.category || null,
    }));
  }

  async listVisitsPaginated(params: {
    cursor?: string;
    limit?: number;
    sort?: string;
    dir?: "asc" | "desc";
    search?: string;
    filters?: VisitFilters;
  }): Promise<PaginatedVisitsResult> {
    const searchParams = new URLSearchParams();
    if (params.cursor) searchParams.set("cursor", params.cursor);
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.sort) searchParams.set("sort", params.sort);
    if (params.dir) searchParams.set("dir", params.dir);
    if (params.search) searchParams.set("search", params.search);
    if (params.filters && Object.keys(params.filters).length > 0) {
      // Backend VisitFilters fields are list[str] | None (extra="forbid"),
      // so single-value filters from the UI must be wrapped in arrays.
      const backendFilters: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(params.filters)) {
        if (value) backendFilters[key] = [value];
      }
      if (Object.keys(backendFilters).length > 0) {
        searchParams.set("filters", JSON.stringify(backendFilters));
      }
    }
    const qs = searchParams.toString();
    return backendGet<PaginatedVisitsResponse>(
      `/projects/${this.projectId}/visits${qs ? `?${qs}` : ""}`,
      this.token
    );
  }

  /** @deprecated Use listVisitsPaginated for paginated access */
  async listVisits(): Promise<NormalizedVisit[]> {
    const visits = await backendGet<
      Array<{
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
      }>
    >(
      `/projects/${this.projectId}/visits`,
      this.token,
      { tags: [`project:${this.projectId}`, `visits:${this.projectId}`], revalidate: 120 }
    );

    return visits.map((visit) => ({
      surveyId: visit.instance_id,
      storeId: visit.store_id,
      storeName: visit.store_name,
      address: visit.address,
      city: visit.city,
      visitDate: new Date(visit.visit_date),
      visitTime: null,
      clerkName: visit.clerk_name,
      install1: visit.install1,
      install2: visit.install2,
      install3: visit.install3,
      install4: null,
      storefrontUrl: null,
      photo1: null,
      photo2: null,
      photo3: null,
      photo4: null,
      photo5: null,
      photo6: null,
      photo7: null,
      photo8: null,
      photo9: null,
      overallNotes: visit.overall_notes,
      photoCount: visit.photo_count,
    })) as NormalizedVisit[];
  }

  async getVisit(surveyId: string): Promise<NormalizedVisit | null> {
    try {
      const visit = await backendGet<BackendVisitDetail>(
        `/projects/${this.projectId}/visits/${surveyId}`,
        this.token,
        { tags: [`visit:${surveyId}`], revalidate: 60 }
      );
      const photos = await this.listPhotos(surveyId);
      return mapVisitDetailToNormalized(visit, photos);
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        return null;
      }
      throw err;
    }
  }

  async listPhotos(surveyId: string): Promise<Array<{ kind: string; url: string }>> {
    const photos = await backendGet<BackendPhoto[]>(
      `/projects/${this.projectId}/visits/${surveyId}/photos`,
      this.token,
      { tags: [`photos:${surveyId}`], revalidate: 60 }
    );
    return photos.map((p) => ({ kind: p.kind, url: p.url }));
  }

  async listProjects(): Promise<ProjectListItem[]> {
    const projects = await backendGet<
      Array<{
        id: string;
        name: string;
        tenant_id: string;
        slug: string;
        client_name: string;
        start_date: string | null;
        end_date: string | null;
        visit_count: number;
      }>
    >("/projects", this.token, { tags: ["projects"], revalidate: 120 });

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      clientName: p.client_name,
      clientSlug: p.tenant_id,
      projectName: p.name,
      projectSlug: p.slug,
      startDate: p.start_date ? new Date(p.start_date) : new Date(),
      endDate: p.end_date ? new Date(p.end_date) : new Date(),
      providerKind: "rest-api" as const,
      visitCount: p.visit_count ?? 0,
    }));
  }
}

/**
 * Maps a backend visit-detail response + photo list into the NormalizedVisit
 * shape expected by the UI. Photo URLs are used as-is (no byte proxying).
 *
 * Photo kind→field mapping:
 *   STOREFRONT  → storefrontUrl
 *   PHOTO_1..9  → photo1..photo9
 */
function mapVisitDetailToNormalized(
  visit: BackendVisitDetail,
  photos: Array<{ kind: string; url: string }>
): NormalizedVisit {
  const byKind = new Map(photos.map((p) => [p.kind, p.url]));

  return {
    surveyId: visit.instance_id,
    storeId: visit.store_id,
    storeName: visit.store_name,
    address: visit.address,
    city: visit.city,
    visitDate: new Date(visit.visit_date),
    visitTime: visit.visit_time,
    clerkName: visit.clerk_name,
    install1: visit.install1,
    install2: visit.install2,
    install3: visit.install3,
    install4: visit.install4,
    storefrontUrl: byKind.get("STOREFRONT") ?? null,
    photo1: byKind.get("PHOTO_1") ?? null,
    photo2: byKind.get("PHOTO_2") ?? null,
    photo3: byKind.get("PHOTO_3") ?? null,
    photo4: byKind.get("PHOTO_4") ?? null,
    photo5: byKind.get("PHOTO_5") ?? null,
    photo6: byKind.get("PHOTO_6") ?? null,
    photo7: byKind.get("PHOTO_7") ?? null,
    photo8: byKind.get("PHOTO_8") ?? null,
    photo9: byKind.get("PHOTO_9") ?? null,
    overallNotes: visit.overall_notes,
    photoCount: photos.length,
  };
}
