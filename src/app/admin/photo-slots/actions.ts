"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminListTenants,
  adminGetPhotoSlots,
  adminUpdatePhotoSlots,
  type AdminTenant,
  type PhotoSlotLabel,
} from "@/server/admin-api";

export async function getPhotoSlotsData(): Promise<{
  tenants: AdminTenant[];
  projects: Array<{ id: string; name: string }>;
  photoSlots: PhotoSlotLabel[];
  defaultTenantId: string;
  defaultProjectId: string;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    redirect("/login");
  }

  const tenants = await adminListTenants(token);

  if (tenants.length === 0) {
    return { tenants, projects: [], photoSlots: [], defaultTenantId: "", defaultProjectId: "" };
  }

  const firstTenant = tenants[0];

  const response = await fetch(
    `http://localhost:8010/admin/tenants/${firstTenant.id}/projects`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  let projects: Array<{ id: string; name: string }> = [];
  if (response.ok) {
    projects = await response.json();
  }

  let photoSlots: PhotoSlotLabel[] = [];
  if (projects.length > 0) {
    photoSlots = await adminGetPhotoSlots(token, projects[0].id);
  }

  return {
    tenants,
    projects,
    photoSlots,
    defaultTenantId: firstTenant.id,
    defaultProjectId: projects.length > 0 ? projects[0].id : "",
  };
}

export async function updatePhotoSlotsAction(
  projectId: string,
  labels: PhotoSlotLabel[]
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    throw new Error("Not authenticated");
  }

  await adminUpdatePhotoSlots(token, projectId, labels);
}

export async function getProjectsForTenant(tenantId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(
    `http://localhost:8010/admin/tenants/${tenantId}/projects`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to load projects");
  }

  return (await response.json()) as Array<{ id: string; name: string }>;
}

export async function getPhotoSlotsForProject(projectId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    throw new Error("Not authenticated");
  }

  return adminGetPhotoSlots(token, projectId);
}
