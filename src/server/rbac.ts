// Server-side authorization helpers. ALL data access paths must route through
// these — never trust the UI alone. See `.claude/rules/tenant-isolation.md`.

import { redirect } from "next/navigation";
import { getDashboardProvider } from "./providers";
import { getBackendSession } from "./backend-auth";
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
  const { role, clientId, tenantIds } = session.user;

  // S3: no token value or PII logged here
  const provider = getDashboardProvider("rest-api", session.user.accessToken, projectId);
  const projects = await provider.listProjects();
  const project = projects.find((p) => p.id === projectId);

  if (!project) redirect("/dashboard");

  if (role === "PLATFORM_ADMIN") return { session, project };

  if (role === "CLIENT_ADMIN") {
    if (!tenantIds.includes(project.clientSlug)) {
      redirect("/dashboard");
    }
    return { session, project };
  }

  if (!clientId || project.clientSlug !== clientId) {
    redirect("/dashboard");
  }

  return { session, project };
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
