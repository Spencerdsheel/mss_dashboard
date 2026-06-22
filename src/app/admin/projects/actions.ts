"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminListTenants,
  adminListTenantProjects,
  adminUpdateProject,
  type AdminTenant,
  type AdminProject,
} from "@/server/admin-api";

export type ProjectsPageData = {
  tenants: AdminTenant[];
  projectsByTenant: Record<string, AdminProject[]>;
};

export async function getProjectsData(): Promise<ProjectsPageData> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    redirect("/login");
  }

  const tenants = await adminListTenants(token);

  const entries = await Promise.all(
    tenants.map(async (t) => {
      try {
        const projects = await adminListTenantProjects(token, t.id);
        return [t.id, projects] as [string, AdminProject[]];
      } catch {
        return [t.id, []] as [string, AdminProject[]];
      }
    })
  );

  return {
    tenants,
    projectsByTenant: Object.fromEntries(entries),
  };
}

export async function updateProjectAction(
  tenantId: string,
  projectId: string,
  data: { name?: string; start_date?: string | null; end_date?: string | null }
): Promise<AdminProject> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    throw new Error("Not authenticated");
  }

  return adminUpdateProject(token, tenantId, projectId, data);
}
