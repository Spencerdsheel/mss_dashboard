import { describe, expect, it, vi } from "vitest";

const backendPut = vi.fn().mockResolvedValue({ layout: { version: 1, widgets: [] }, source: "manual", updated_at: null });
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue({ value: "token" }) }) }));
vi.mock("@/server/backend-api", () => ({ backendPut, backendDelete: vi.fn(), backendPost: vi.fn() }));

describe("saveDashboardLayoutAction", () => {
  it("addresses the locations page-scoped layout resource", async () => {
    const { saveDashboardLayoutAction } = await import("@/app/dashboard/projects/[projectId]/dashboard-layout-actions");
    await saveDashboardLayoutAction("proj_a", { version: 1, widgets: [] }, "manual", "locations");
    expect(backendPut).toHaveBeenCalledWith("/admin/projects/proj_a/dashboard-layout/locations", "token", expect.any(Object));
  });
});
