// Verifies the provider seam: both providers conform to DashboardDataProvider,
// the sample provider is fully wired, and the Shopmetrics provider is a
// throw-only placeholder. This guards the future-API-boundary rule.

import { describe, expect, it } from "vitest";
import { getDashboardProvider } from "@/server/providers";
import { SampleDataProvider } from "@/server/providers/sample-provider";
import { ShopmetricsProvider } from "@/server/providers/shopmetrics-provider";

describe("DashboardDataProvider contract", () => {
  it("SampleDataProvider implements every method", async () => {
    const p = new SampleDataProvider();
    expect(p.kind).toBe("sample");
    const desc = await p.describeProject();
    expect(desc.clientName).toBe("Brasserie Labatt");
    expect(desc.projectName).toBe("Messi and Flying Fish");
    const metrics = await p.listProjectMetrics();
    expect(metrics.find((m) => m.key === "standeeTarget")?.value).toBe(450);
    expect(metrics.find((m) => m.key === "flyingFishTarget")?.value).toBe(400);
    const visits = await p.listVisits();
    expect(visits.length).toBe(436);
  });

  it("ShopmetricsProvider is a placeholder — every method throws", async () => {
    const p = new ShopmetricsProvider();
    expect(p.kind).toBe("shopmetrics");
    await expect(p.describeProject()).rejects.toThrow(/not implemented in v1/);
    await expect(p.listProjectMetrics()).rejects.toThrow(/not implemented in v1/);
    await expect(p.listVisits()).rejects.toThrow(/not implemented in v1/);
  });

  it("factory defaults to SampleDataProvider", () => {
    const p = getDashboardProvider("sample");
    expect(p.kind).toBe("sample");
  });

  it("factory can return ShopmetricsProvider (still a stub)", () => {
    const p = getDashboardProvider("shopmetrics");
    expect(p.kind).toBe("shopmetrics");
  });
});
