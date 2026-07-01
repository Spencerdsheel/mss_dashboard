"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminListUsers,
  adminListTenants,
  adminCreateUser,
  adminUpdateUser,
  adminIssuePasswordReset,
  type AdminUser,
  type AdminTenant,
  type PasswordResetIssueResult,
} from "@/server/admin-api";

export async function getUsersAndTenants(): Promise<{
  users: AdminUser[];
  tenants: AdminTenant[];
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    redirect("/login");
  }

  const [users, tenants] = await Promise.all([
    adminListUsers(token),
    adminListTenants(token),
  ]);

  return { users, tenants };
}

export async function getProjectsForTenant(
  tenantId: string
): Promise<Array<{ id: string; name: string }>> {
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

export async function createUserAction(formData: FormData) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    throw new Error("Not authenticated");
  }

  const email = formData.get("email") as string;
  const name = formData.get("name") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;
  const tenant_id = formData.get("tenant_id") as string;
  const project_ids = formData.get("project_ids") as string;
  const tenant_ids = formData.get("tenant_ids") as string;

  try {
    await adminCreateUser(token, {
      email,
      name: name || undefined,
      password,
      role,
      tenant_id: tenant_id || null,
      project_ids: project_ids ? project_ids.split(",").map((s) => s.trim()) : [],
      tenant_ids: tenant_ids ? tenant_ids.split(",").map((s) => s.trim()) : [],
    });
  } catch (error) {
    throw error;
  }
}

export async function issuePasswordResetAction(
  userId: string
): Promise<PasswordResetIssueResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    throw new Error("Not authenticated");
  }

  return adminIssuePasswordReset(token, userId);
}

export async function updateUserAction(
  userId: string,
  formData: FormData
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    throw new Error("Not authenticated");
  }

  const name = formData.get("name") as string;
  const role = formData.get("role") as string;
  const tenant_id = formData.get("tenant_id") as string;
  const project_ids = formData.get("project_ids") as string;
  const tenant_ids = formData.get("tenant_ids") as string;
  const password = formData.get("password") as string;

  try {
    await adminUpdateUser(token, userId, {
      name: name || null,
      role,
      tenant_id: tenant_id || null,
      project_ids: project_ids ? project_ids.split(",").map((s) => s.trim()) : [],
      tenant_ids: tenant_ids ? tenant_ids.split(",").map((s) => s.trim()) : [],
      password: password || undefined,
    });
  } catch (error) {
    throw error;
  }
}
