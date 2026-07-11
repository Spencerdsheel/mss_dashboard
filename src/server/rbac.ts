// Server-side authorization helpers. ALL data access paths must route through
// these — never trust the UI alone. See `.claude/rules/tenant-isolation.md`.

import { redirect } from "next/navigation";
import { getDashboardProvider } from "./providers";
import { getBackendSession } from "./backend-auth";
import { backendGet } from "./backend-api";
import { cookies } from "next/headers";
import type { Role } from "@/types/role";

export type AuthSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    clientId: string | null;
    tenantIds: string[];
    accessToken: string;
  };
};

export async function requireSession(): Promise<AuthSession> {
  const backendSession = await getBackendSession();
  if (!backendSession) {
    // S3: no PII in logs — do not log email, token, or cookie value
    redirect("/login");
  }

  return {
    user: {
      id: backendSession.user.id,
      email: backendSession.user.email,
      name: backendSession.user.email,
      role: backendSession.user.role as Role,
      clientId: backendSession.user.tenant_id,
      tenantIds: backendSession.user.tenant_ids,
      accessToken: backendSession.token,
    },
  };
}

export async function requireAdmin(): Promise<AuthSession> {
  const session = await requireSession();
  if (session.user.role !== "PLATFORM_ADMIN") redirect("/dashboard");
  return session;
}

export async function requireAdminOrAbove(): Promise<AuthSession> {
  const session = await requireSession();
  if (session.user.role !== "PLATFORM_ADMIN" && session.user.role !== "CLIENT_ADMIN")
    redirect("/dashboard");
  return session;
}

/**
 * Enforce that the session user can see this project. Admins see everything.
 * Client users must be a member of the project AND it must belong to their client.
 */
export async function assertProjectAccess(projectId: string) {
  const session = await requireSession();

  // S3: no token value or PII logged here. Access enforcement is delegated to
  // the backend (tenant/project scoping is derived from verified JWT claims
  // there, not re-derived client-side) — a single GET replaces the previous
  // fetch-all-projects-then-search waterfall.
  try {
    const project = await backendGet<{
      id: string;
      name: string;
      tenant_id: string;
      slug: string;
      client_name: string;
      start_date: string | null;
      end_date: string | null;
      visit_count: number;
    }>(`/projects/${projectId}`, session.user.accessToken);

    return {
      session,
      project: {
        id: project.id,
        name: project.name,
        clientName: project.client_name,
        clientSlug: project.tenant_id,
        projectName: project.name,
        projectSlug: project.slug,
        startDate: project.start_date ? new Date(project.start_date) : new Date(),
        endDate: project.end_date ? new Date(project.end_date) : new Date(),
        providerKind: "rest-api" as const,
        visitCount: project.visit_count ?? 0,
      },
    };
  } catch {
    redirect("/dashboard");
  }
}

/** Returns the list of projects the current user can see. */
export async function listVisibleProjects() {
  const session = await requireSession();
  const { role, clientId, tenantIds } = session.user;

  const provider = getDashboardProvider("rest-api", session.user.accessToken);
  const projects = await provider.listProjects();

  if (role === "PLATFORM_ADMIN") {
    return projects;
  }

  if (role === "CLIENT_ADMIN") {
    return projects.filter((p) => tenantIds.includes(p.clientSlug));
  }

  return projects.filter((p) => p.clientSlug === clientId);
}

export function isAdminRole(role: Role | undefined) {
  return role === "PLATFORM_ADMIN" || role === "CLIENT_ADMIN";
}

export { ROLE_LABELS } from "@/types/role";
