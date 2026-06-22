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
      accessToken: backendSession.token,
    },
  };
}

export async function requireAdmin(): Promise<AuthSession> {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return session;
}

/**
 * Enforce that the session user can see this project. Admins see everything.
 * Client users must be a member of the project AND it must belong to their client.
 */
export async function assertProjectAccess(projectId: string) {
  const session = await requireSession();
  const { role, clientId } = session.user;

  // S3: no token value or PII logged here
  const provider = getDashboardProvider("rest-api", session.user.accessToken, projectId);
  const projects = await provider.listProjects();
  const project = projects.find((p) => p.id === projectId);
  
  if (!project) redirect("/dashboard");
  
  if (role === "ADMIN") return { session, project };
  
  if (!clientId || project.clientSlug !== clientId) {
    redirect("/dashboard");
  }
  
  return { session, project };
}

/** Returns the list of projects the current user can see. */
export async function listVisibleProjects() {
  const session = await requireSession();
  const { role, clientId } = session.user;

  const provider = getDashboardProvider("rest-api", session.user.accessToken);
  const projects = await provider.listProjects();
  
  // Admin sees all projects, client sees only their tenant's projects
  if (role === "ADMIN") {
    return projects;
  }
  
  return projects.filter((p) => p.clientSlug === clientId);
}

export function isAdminRole(role: Role | undefined) {
  return role === "ADMIN";
}
