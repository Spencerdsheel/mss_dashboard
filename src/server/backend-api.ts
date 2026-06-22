// Phase 04 REST client foundation.
// Existing pages still use the Prisma path until each route is migrated and
// parity-tested. New dashboard API work should use these helpers.

const DEFAULT_BACKEND_API_URL = "http://localhost:8010";

export type BackendAuthToken = {
  access_token: string;
  token_type: "bearer";
  user: {
    id: string;
    email: string;
    role: "ADMIN" | "CLIENT";
    tenant_id: string | null;
    project_ids: string[];
  };
};

export async function backendLogin(email: string, password: string) {
  return backendFetch<BackendAuthToken>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: { "content-type": "application/json" },
    authenticated: false,
  });
}

export async function backendGet<T>(
  path: string,
  token: string,
  cacheOptions?: {
    tags?: string[];
    revalidate?: number;
  }
) {
  return backendFetch<T>(path, {
    method: "GET",
    token,
    authenticated: true,
    cacheOptions,
  });
}

export async function backendPost<T>(path: string, token: string, body: any) {
  return backendFetch<T>(path, {
    method: "POST",
    token,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    authenticated: true,
  });
}

export async function backendPatch<T>(path: string, token: string, body: any) {
  return backendFetch<T>(path, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    authenticated: true,
  });
}

async function backendFetch<T>(
  path: string,
  options: {
    method: "GET" | "POST" | "PATCH";
    token?: string;
    body?: string;
    headers?: Record<string, string>;
    authenticated: boolean;
    cacheOptions?: {
      tags?: string[];
      revalidate?: number;
    };
  }
): Promise<T> {
  const baseUrl = process.env.BACKEND_API_URL ?? DEFAULT_BACKEND_API_URL;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.authenticated) {
    if (!options.token) throw new Error("Backend API token is required");
    headers.authorization = `Bearer ${options.token}`;
  }

  const fetchOptions: RequestInit = {
    method: options.method,
    headers,
    body: options.body,
  };

  // Apply caching strategy
  if (options.cacheOptions) {
    fetchOptions.cache = "force-cache";
    fetchOptions.next = {
      tags: options.cacheOptions.tags,
      revalidate: options.cacheOptions.revalidate,
    };
  } else {
    fetchOptions.cache = "no-store";
  }

  const response = await fetch(`${baseUrl}${path}`, fetchOptions);
  if (!response.ok) {
    throw new Error(`Backend API ${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}
