import {
  DEMO_CLIENT_NAME,
  DEMO_CLIENT_SLUG,
  DEMO_PROJECT_ID,
  DEMO_PROJECT_NAME,
  DEMO_PROJECT_SLUG,
  EXPECTED_DATE_END,
  EXPECTED_DATE_START,
} from "@/lib/constants";
import { generateSampleVisits } from "./sample-data";
import type {
  DashboardDataProvider,
  NormalizedVisit,
  PaginatedVisitsResult,
  ProjectDescriptor,
  ProjectMetric,
  ProjectListItem,
} from "./types";

export class SampleDataProvider implements DashboardDataProvider {
  readonly kind = "sample" as const;

  async describeProject(): Promise<ProjectDescriptor> {
    return {
      clientName: DEMO_CLIENT_NAME,
      clientSlug: DEMO_CLIENT_SLUG,
      projectName: DEMO_PROJECT_NAME,
      projectSlug: DEMO_PROJECT_SLUG,
      locale: "fr-CA",
      startDate: new Date(`${EXPECTED_DATE_START}T00:00:00Z`),
      endDate: new Date(`${EXPECTED_DATE_END}T00:00:00Z`),
    };
  }

  async listProjectMetrics(): Promise<ProjectMetric[]> {
    return [
      {
        key: "standeeTarget",
        label: "Standee Messi Target",
        value: 450,
        unit: "stores",
        category: "target",
      },
      {
        key: "flyingFishTarget",
        label: "Flying Fish Display Target",
        value: 400,
        unit: "stores",
        category: "target",
      },
      // Reference/workbook-only metrics preserved explicitly rather than dropped.
      // Source: final presentation workbook stock-denominator intent.
      {
        key: "stockDenominator",
        label: "Dénominateur Stock (réf. classeur)",
        value: 432,
        unit: "magasins",
        category: "reference",
      },
    ];
  }

  async listVisits(): Promise<NormalizedVisit[]> {
    return generateSampleVisits();
  }

  async listVisitsPaginated(params: {
    cursor?: string;
    limit?: number;
    sort?: string;
    dir?: "asc" | "desc";
    search?: string;
    filters?: Record<string, string | undefined>;
  }): Promise<PaginatedVisitsResult> {
    let visits = await this.listVisits();

    if (params.search) {
      const term = params.search.toLowerCase();
      visits = visits.filter((v) => v.storeName.toLowerCase().includes(term));
    }
    if (params.filters) {
      const { city, install1, install2, install3 } = params.filters;
      if (city) visits = visits.filter((v) => v.city === city);
      if (install1) visits = visits.filter((v) => v.install1 === install1);
      if (install2) visits = visits.filter((v) => v.install2 === install2);
      if (install3) visits = visits.filter((v) => v.install3 === install3);
    }

    const dir = params.dir === "asc" ? 1 : -1;
    visits = [...visits].sort((a, b) => dir * (a.visitDate.getTime() - b.visitDate.getTime()));

    const total_count = visits.length;
    const limit = params.limit ?? 25;
    const page = visits.slice(0, limit);

    const allVisits = await this.listVisits();
    const unique = (values: Array<string | null>) =>
      Array.from(new Set(values.filter((v): v is string => !!v))).sort();

    return {
      items: page.map((v) => ({
        instance_id: v.surveyId,
        store_id: v.storeId,
        store_name: v.storeName,
        visit_date: v.visitDate.toISOString(),
        city: v.city,
        address: v.address,
        clerk_name: v.clerkName,
        install1: v.install1,
        install2: v.install2,
        install3: v.install3,
        overall_notes: v.overallNotes,
        photo_count: v.photoCount ?? 0,
      })),
      next_cursor: null,
      prev_cursor: null,
      total_count,
      filter_options: {
        cities: unique(allVisits.map((v) => v.city)),
        install1_values: unique(allVisits.map((v) => v.install1)),
        install2_values: unique(allVisits.map((v) => v.install2)),
        install3_values: unique(allVisits.map((v) => v.install3)),
      },
    };
  }

  async getVisit(surveyId: string): Promise<NormalizedVisit | null> {
    const visits = await this.listVisits();
    return visits.find((v) => v.surveyId === surveyId) ?? null;
  }

  async listPhotos(surveyId: string): Promise<Array<{ kind: string; url: string }>> {
    const visit = await this.getVisit(surveyId);
    if (!visit) return [];
    const slots: Array<[string, string | null]> = [
      ["STOREFRONT", visit.storefrontUrl],
      ["PHOTO_1", visit.photo1],
      ["PHOTO_2", visit.photo2],
      ["PHOTO_3", visit.photo3],
      ["PHOTO_4", visit.photo4],
      ["PHOTO_5", visit.photo5],
      ["PHOTO_6", visit.photo6],
      ["PHOTO_7", visit.photo7],
      ["PHOTO_8", visit.photo8],
      ["PHOTO_9", visit.photo9],
    ];
    return slots
      .filter((s): s is [string, string] => s[1] !== null)
      .map(([kind, url]) => ({ kind, url }));
  }

  async listProjects(): Promise<ProjectListItem[]> {
    const visits = await this.listVisits();
    return [
      {
        id: DEMO_PROJECT_ID,
        name: DEMO_PROJECT_NAME,
        clientName: DEMO_CLIENT_NAME,
        clientSlug: DEMO_CLIENT_SLUG,
        projectName: DEMO_PROJECT_NAME,
        projectSlug: DEMO_PROJECT_SLUG,
        startDate: new Date(`${EXPECTED_DATE_START}T00:00:00Z`),
        endDate: new Date(`${EXPECTED_DATE_END}T00:00:00Z`),
        providerKind: "sample",
        visitCount: visits.length,
      },
    ];
  }
}
