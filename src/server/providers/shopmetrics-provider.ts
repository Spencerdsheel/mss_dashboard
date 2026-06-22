// ShopmetricsProvider â€” PLACEHOLDER ONLY.
// v1 of this demo is sample-data-only. This file declares where the future
// Shopmetrics API ingestion will plug in. It must not perform any real
// network calls and must not be used as a live data source in v1.

import type {
  DashboardDataProvider,
  NormalizedVisit,
  ProjectDescriptor,
  ProjectMetric,
  ProjectListItem,
} from "./types";

export class ShopmetricsProvider implements DashboardDataProvider {
  readonly kind = "shopmetrics" as const;

  constructor(private readonly _config: { apiKey?: string; baseUrl?: string } = {}) {}

  async describeProject(): Promise<ProjectDescriptor> {
    throw new Error(
      "ShopmetricsProvider.describeProject is not implemented in v1. " +
        "This is the future integration seam â€” wire a real Shopmetrics API client here."
    );
  }

  async listProjectMetrics(): Promise<ProjectMetric[]> {
    throw new Error(
      "ShopmetricsProvider.listProjectMetrics is not implemented in v1."
    );
  }

  async listVisits(): Promise<NormalizedVisit[]> {
    throw new Error(
      "ShopmetricsProvider.listVisits is not implemented in v1. " +
        "Future work: call Shopmetrics API, normalize to NormalizedVisit, return."
    );
  }

  async getVisit(_surveyId: string): Promise<NormalizedVisit | null> {
    throw new Error(
      "ShopmetricsProvider.getVisit is not implemented in v1. " +
        "Future work: call Shopmetrics API to fetch a single visit."
    );
  }

  async listPhotos(_surveyId: string): Promise<Array<{ kind: string; url: string }>> {
    throw new Error(
      "ShopmetricsProvider.listPhotos is not implemented in v1. " +
        "Future work: call Shopmetrics API to list photos for a visit."
    );
  }

  async listProjects(): Promise<ProjectListItem[]> {
    throw new Error(
      "ShopmetricsProvider.listProjects is not implemented in v1. " +
        "Future work: call Shopmetrics API to list projects."
    );
  }
}
