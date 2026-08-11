"use server";

// Sprint 13b — server actions wrapping the admin PUT/DELETE dashboard-layout
// calls (mirrors src/app/admin/connections/actions.ts). tenant_id is never
// passed from the client here — the backend derives it from the verified JWT
// via the project row, exactly as the read path does (see
// .claude/rules/tenant-isolation.md). The token is read from the httpOnly
// auth cookie, never from a client-supplied value.

import { cookies } from "next/headers";
import { backendPut, backendDelete, backendPost, backendGet } from "@/server/backend-api";
import type { LayoutConfig } from "@/lib/dashboard-layout";
import type { FreeformLayoutConfig } from "@/lib/freeform-layout";

type StoredLayoutConfig = LayoutConfig | FreeformLayoutConfig;

type DashboardLayoutResponse = {
  layout: StoredLayoutConfig;
  source: string;
  updated_at: string | null;
};

// Sprint 14: preview-only response from POST .../dashboard-layout/suggest —
// there is no updated_at because nothing was persisted.
type DashboardLayoutSuggestResponse = {
  layout: LayoutConfig;
  source: "ai_suggested";
};

async function requireToken(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";
  if (!token) {
    throw new Error("Not authenticated");
  }
  return token;
}

/** PUT /admin/projects/{id}/dashboard-layout — persists an admin-edited layout. */
export async function saveDashboardLayoutAction(
  projectId: string,
  layout: StoredLayoutConfig,
  source: "manual" | "ai_suggested" = "manual",
  page: string = "overview"
): Promise<DashboardLayoutResponse> {
  const token = await requireToken();
  return backendPut<DashboardLayoutResponse>(
    `/admin/projects/${projectId}/dashboard-layout/${page}`,
    token,
    { layout, source }
  );
}

/** DELETE /admin/projects/{id}/dashboard-layout — "Reset to default". */
export async function resetDashboardLayoutAction(projectId: string, page: string = "overview"): Promise<void> {
  const token = await requireToken();
  await backendDelete(`/admin/projects/${projectId}/dashboard-layout/${page}`, token);
}

/**
 * Sprint 14 — POST /admin/projects/{id}/dashboard-layout/suggest.
 *
 * Preview-only: fetches an AI-proposed layout for the admin to review in the
 * edit-mode draft. Never auto-applies or auto-persists — the admin must
 * still click Save (saveDashboardLayoutAction) to persist it, at which point
 * it is written with source: "ai_suggested". If ANTHROPIC_API_KEY is unset
 * backend-side, the backend returns an explicit 503 "AI suggestions not
 * configured" which surfaces here as a thrown Error — never a silent
 * fallback to the deterministic default (.claude/rules/sample-data.md §5.2).
 */
export async function suggestLayoutAction(projectId: string): Promise<DashboardLayoutSuggestResponse> {
  const token = await requireToken();
  return backendPost<DashboardLayoutSuggestResponse>(
    `/admin/projects/${projectId}/dashboard-layout/suggest`,
    token,
    {}
  );
}

/**
 * Sprint 19 — GET /admin/settings/ai_layout_generation_enabled.
 *
 * Frontend defense-in-depth only (spec §6.5): used to hide (not just
 * disable) the "Generate overview page (AI)" button when the platform admin
 * has turned the capability off. The backend 403 on the suggest endpoint is
 * the real gate — a stale/cached read here must never be trusted as
 * sufficient security. Only called for admin sessions (the setting is
 * admin-only server-side); defaults to enabled on any fetch error so a
 * transient failure never silently reveals/hides more than intended —
 * matches the seed-default-true decision.
 */
export async function getAiLayoutGenerationEnabledAction(): Promise<boolean> {
  const token = await requireToken();
  try {
    const result = await backendGet<{ key: string; value: string }>(
      "/admin/settings/ai_layout_generation_enabled",
      token
    );
    return result.value.toLowerCase() !== "false";
  } catch {
    return true;
  }
}
