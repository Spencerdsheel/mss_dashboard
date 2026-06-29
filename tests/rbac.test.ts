// RBAC semantics tests — pure logic, no DB required.
//
// We verify the *policy* that the server-side helpers enforce. The helpers
// themselves (`src/server/rbac.ts`) call `redirect()` on failure, so we can't
// unit-test them directly without mocking Next.js internals. Instead, we
// encode the contract as a pure function and exercise it. Any change to the
// policy must update both this contract and `src/server/rbac.ts`.

import { describe, expect, it } from "vitest";

type Role = "PLATFORM_ADMIN" | "CLIENT_ADMIN" | "TENANT_USER";
type SessionUser = { id: string; role: Role; clientId: string | null };
type Project = { id: string; clientId: string };
type Membership = { userId: string; projectId: string };

function canAccessProject(
  user: SessionUser,
  project: Project | null,
  membership: Membership | null
): boolean {
  if (!project) return false;
  if (user.role === "PLATFORM_ADMIN") return true;
  if (!user.clientId) return false;
  if (project.clientId !== user.clientId) return false;
  if (!membership) return false;
  return true;
}

const admin: SessionUser = { id: "u_admin", role: "PLATFORM_ADMIN", clientId: null };
const clientA: SessionUser = { id: "u_clientA", role: "TENANT_USER", clientId: "c_A" };
const clientB: SessionUser = { id: "u_clientB", role: "TENANT_USER", clientId: "c_B" };

const projectA: Project = { id: "p_A", clientId: "c_A" };
const projectB: Project = { id: "p_B", clientId: "c_B" };

const membershipA = { userId: "u_clientA", projectId: "p_A" };

describe("RBAC policy", () => {
  it("admin can access any project", () => {
    expect(canAccessProject(admin, projectA, null)).toBe(true);
    expect(canAccessProject(admin, projectB, null)).toBe(true);
  });

  it("client with membership can access their own project", () => {
    expect(canAccessProject(clientA, projectA, membershipA)).toBe(true);
  });

  it("client without membership cannot access their tenant's project", () => {
    expect(canAccessProject(clientA, projectA, null)).toBe(false);
  });

  it("client cannot access another tenant's project, even with a stray membership", () => {
    const strayMembership = { userId: "u_clientA", projectId: "p_B" };
    expect(canAccessProject(clientA, projectB, strayMembership)).toBe(false);
  });

  it("client cannot access another tenant's project without membership", () => {
    expect(canAccessProject(clientB, projectA, null)).toBe(false);
  });

  it("client without clientId is denied everywhere", () => {
    const orphan: SessionUser = { id: "u_orphan", role: "TENANT_USER", clientId: null };
    expect(canAccessProject(orphan, projectA, membershipA)).toBe(false);
  });

  it("missing project is denied", () => {
    expect(canAccessProject(admin, null, null)).toBe(false);
    expect(canAccessProject(clientA, null, membershipA)).toBe(false);
  });
});
