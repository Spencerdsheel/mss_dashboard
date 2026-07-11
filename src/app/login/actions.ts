"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { backendLogin } from "@/server/backend-api";

function sanitizeCallbackUrl(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const callbackUrl = sanitizeCallbackUrl(formData.get("callbackUrl") as string);

  try {
    const response = await backendLogin(email, password);

    // Set httpOnly cookie - not accessible to JavaScript
    const cookieStore = await cookies();
    cookieStore.set("auth_token", response.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3600, // 1 hour
      path: "/",
    });

    redirect(callbackUrl);
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    const msg = (err as Error)?.message ?? "";
    const isAuthError = msg.includes("401") || msg.includes("403");
    const errorCode = isAuthError ? "invalid_credentials" : "service_unavailable";
    redirect(`/login?error=${errorCode}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
}

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
  redirect("/login");
}
