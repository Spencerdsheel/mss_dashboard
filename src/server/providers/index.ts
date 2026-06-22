import { SampleDataProvider } from "./sample-provider";
import { ShopmetricsProvider } from "./shopmetrics-provider";
import { RestApiProvider } from "./rest-api-provider";
import type { DashboardDataProvider } from "./types";

export type ProviderKind = "sample" | "shopmetrics" | "rest-api";

/**
 * Factory for the active data provider.
 *
 * Supports three modes:
 * - "sample": Sample data generator (436 synthetic visits)
 * - "shopmetrics": Placeholder for future Shopmetrics API
 * - "rest-api": Python backend REST API (436 real visits from Excel)
 */
export function getDashboardProvider(
  kind: ProviderKind = (process.env.DATA_PROVIDER as ProviderKind) || "sample",
  token: string = "",
  projectId: string = "project_messi_flying_fish"
): DashboardDataProvider {
  if (kind === "rest-api") {
    if (!token) {
      // Red-line: do NOT fall back to sample data when the token is missing.
      // Callers must redirect to login when this throws.
      throw new Error(
        "REST API provider requires an auth token. " +
          "The session may have expired — please log in again."
      );
    }
    const BACKEND_API_URL = process.env.BACKEND_API_URL || "http://localhost:8010";
    return new RestApiProvider(BACKEND_API_URL, token, projectId);
  }

  if (kind === "shopmetrics") {
    // Intentionally not wired to real API in v1 — keep the seam, not the impl.
    return new ShopmetricsProvider();
  }

  // "sample" is only reachable via an explicit DATA_PROVIDER=sample env setting.
  return new SampleDataProvider();
}

export function createProviderForServer(
  kind: ProviderKind = (process.env.DATA_PROVIDER as ProviderKind) || "sample",
  cookieHeader?: string | null,
  projectId: string = "project_messi_flying_fish"
): DashboardDataProvider {
  const token = extractTokenFromCookie(cookieHeader);
  return getDashboardProvider(kind, token, projectId);
}

function extractTokenFromCookie(cookieHeader?: string | null): string {
  if (!cookieHeader) return "";
  const match = cookieHeader.match(/auth_token=([^;]+)/);
  return match ? match[1] : "";
}

export { SampleDataProvider, ShopmetricsProvider, RestApiProvider };
export type { DashboardDataProvider };
