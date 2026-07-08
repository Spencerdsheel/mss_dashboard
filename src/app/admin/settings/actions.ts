"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminGetAllSettings, adminUpdateSetting } from "@/server/admin-api";

export async function getSettingsData() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token");
  if (!token) redirect("/login");

  try {
    const settings = await adminGetAllSettings(token.value);
    return { settings };
  } catch {
    return { settings: {} as Record<string, string> };
  }
}

export async function updateSetting(key: string, value: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token");
  if (!token) redirect("/login");

  try {
    await adminUpdateSetting(token.value, key, value.trim());
    revalidatePath("/dashboard", "layout");
    revalidatePath("/admin", "layout");
    return { success: true };
  } catch {
    return { error: `Failed to update ${key}` };
  }
}
