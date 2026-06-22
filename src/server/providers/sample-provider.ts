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
