"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export async function logoutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (token) {
    try {
      const backendUrl = process.env.BACKEND_API_URL ?? "http://localhost:8010";
      await fetch(`${backendUrl}/auth/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Best-effort — don't block logout UX on backend failure
    }
  }

  cookieStore.delete("auth_token");
  redirect("/login?loggedout=1");
}
