"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { backendLogin } from "@/server/backend-api";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const callbackUrl = formData.get("callbackUrl") as string || "/dashboard";

  console.log("[loginAction] Attempting login for:", email);

  try {
    const response = await backendLogin(email, password);
    console.log("[loginAction] Login successful, token length:", response.access_token?.length || 0);
    
    // Set httpOnly cookie - not accessible to JavaScript
    const cookieStore = await cookies();
    cookieStore.set("auth_token", response.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3600, // 1 hour
      path: "/",
    });
    
    console.log("[loginAction] Cookie set, redirecting to:", callbackUrl);

    redirect(callbackUrl);
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error("[loginAction] Login failed:", err);
    redirect(`/login?error=invalid_credentials&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("auth_token");
  redirect("/login");
}
