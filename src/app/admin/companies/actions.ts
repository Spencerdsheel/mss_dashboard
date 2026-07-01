"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminListCompanies, adminCreateCompany, adminUpdateCompany } from "@/server/admin-api";

export async function getCompanies() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";
  return adminListCompanies(token);
}

export async function createCompanyAction(formData: FormData) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";
  if (!token) {
    throw new Error("Not authenticated");
  }
  const name = (formData.get("name") as string).trim();
  const slug = (formData.get("slug") as string).trim().toLowerCase();
  return adminCreateCompany(token, { name, slug });
}

export async function updateCompanyAction(companyId: string, formData: FormData) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";
  if (!token) {
    throw new Error("Not authenticated");
  }
  const name = (formData.get("name") as string).trim();
  const slug = (formData.get("slug") as string).trim().toLowerCase();
  return adminUpdateCompany(token, companyId, { name, slug });
}
