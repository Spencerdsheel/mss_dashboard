// Sprint 16 §4.4 — pure pathname -> breadcrumb-label mapping. Kept
// deliberately two-level ("Dashboard / <label>"), not a full trail.

import { describe, expect, it } from "vitest";
import { breadcrumbLabelFor } from "@/lib/breadcrumb";

describe("breadcrumbLabelFor", () => {
  it("maps the project list root to All Projects", () => {
    expect(breadcrumbLabelFor("/dashboard")).toBe("All Projects");
  });

  it("maps a project overview page to Overview", () => {
    expect(breadcrumbLabelFor("/dashboard/projects/abc-123")).toBe("Overview");
  });

  it("maps the locations page to Locations", () => {
    expect(breadcrumbLabelFor("/dashboard/projects/abc-123/locations")).toBe("Locations");
  });

  it("maps the visits list page to Visits", () => {
    expect(breadcrumbLabelFor("/dashboard/projects/abc-123/visits")).toBe("Visits");
  });

  it("maps a visit detail page to Visit Details", () => {
    expect(breadcrumbLabelFor("/dashboard/projects/abc-123/visits/xyz-789")).toBe(
      "Visit Details"
    );
  });

  it("maps admin sub-pages to their own labels", () => {
    expect(breadcrumbLabelFor("/admin/users")).toBe("Manage Users");
    expect(breadcrumbLabelFor("/admin/companies")).toBe("Companies");
  });

  it("falls back to Dashboard for unrecognized paths", () => {
    expect(breadcrumbLabelFor("/some/unknown/path")).toBe("Dashboard");
    expect(breadcrumbLabelFor("")).toBe("Dashboard");
  });
});
