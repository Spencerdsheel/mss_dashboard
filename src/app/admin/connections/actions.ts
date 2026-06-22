"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminListTenants,
  adminGetConnection,
  adminUpdateConnectionDisplayName,
  adminUpdateConnection,
  type AdminTenant,
  type ProviderConnection,
} from "@/server/admin-api";

export type ConnectionPageData = {
  tenants: AdminTenant[];
  connections: Record<string, ProviderConnection | null>;
};

export async function getConnectionsData(): Promise<ConnectionPageData> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    redirect("/login");
  }

  const tenants = await adminListTenants(token);

  const connectionEntries = await Promise.all(
    tenants.map(async (t) => {
      const conn = await adminGetConnection(token, t.id);
      return [t.id, conn] as [string, ProviderConnection | null];
    })
  );

  return {
    tenants,
    connections: Object.fromEntries(connectionEntries),
  };
}

export async function updateDisplayNameAction(
  tenantId: string,
  displayName: string | null
): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    throw new Error("Not authenticated");
  }

  // Read current connection so we can preserve base_url/client_id while only changing display_name.
  const existing = await adminGetConnection(token, tenantId);
  if (!existing) {
    throw new Error(`No provider connection found for tenant ${tenantId}`);
  }

  await adminUpdateConnectionDisplayName(token, tenantId, displayName, existing);
}

export async function updateConnectionAction(
  tenantId: string,
  patch: { display_name?: string | null; status?: string; base_url?: string }
): Promise<ProviderConnection> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    throw new Error("Not authenticated");
  }

  const existing = await adminGetConnection(token, tenantId);
  if (!existing) {
    throw new Error(`No provider connection found for tenant ${tenantId}`);
  }

  return adminUpdateConnection(token, tenantId, patch, existing);
}
