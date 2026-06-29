import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type BackendSession = {
  user: {
    id: string;
    email: string;
    role: "PLATFORM_ADMIN" | "CLIENT_ADMIN" | "TENANT_USER";
    tenant_id: string | null;
    project_ids: string[];
  };
  token: string;
};

export async function getBackendSession(): Promise<BackendSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("auth_token");

  // S3: Do not log cookie value, JWT payload, email, or token prefix.
  // Any of these would write credential material to server logs.
  const token = cookie?.value;

  if (!token) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      user: {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        tenant_id: payload.tenant_id,
        project_ids: payload.project_ids || [],
      },
      token,
    };
  } catch {
    // S3: do not log the error detail — it may contain token fragments
    return null;
  }
}

export async function requireBackendSession(): Promise<BackendSession> {
  const session = await getBackendSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireBackendAdmin(): Promise<BackendSession> {
  const session = await requireBackendSession();
  if (session.user.role !== "PLATFORM_ADMIN") redirect("/dashboard");
  return session;
}
