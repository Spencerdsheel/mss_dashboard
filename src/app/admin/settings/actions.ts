"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminGetSetting, adminUpdateSetting } from "@/server/admin-api";

export async function getSettingsData() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token");
  if (!token) redirect("/login");

  try {
    const siteTitle = await adminGetSetting(token.value, "site_title");
    return { siteTitle: siteTitle.value };
  } catch {
    return { siteTitle: "iSN" };
  }
}

export async function updateSiteTitle(formData: FormData) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token");
  if (!token) redirect("/login");

  const value = formData.get("site_title") as string;
  if (!value || value.trim().length === 0) {
    return { error: "Site title cannot be empty" };
  }

  try {
    await adminUpdateSetting(token.value, "site_title", value.trim());
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch {
    return { error: "Failed to update site title" };
  }
}