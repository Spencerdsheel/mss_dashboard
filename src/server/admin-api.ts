import { backendGet, backendPost, backendPatch } from "./backend-api";

export type AdminTenant = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  status: string;
  locale: string;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "CLIENT";
  tenant_id: string | null;
  project_ids: string[];
  status: string;
};

export type AdminRunLog = {
  id: string;
  tenant_id: string;
  status: "success" | "failed";
  started_at: string;
  finished_at: string | null;
  rows_pulled: number;
  error_message: string | null;
  created_at: string;
};

export type PhotoSlotLabel = {
  kind: string;
  label: string;
};

export async function adminListTenants(token: string) {
  return backendGet<AdminTenant[]>("/admin/tenants", token);
}

export async function adminCreateTenant(
  token: string,
  data: { name: string; slug: string; locale?: string }
) {
  return backendPost<AdminTenant>("/admin/tenants", token, data);
}

export async function adminUpdateTenant(
  token: string,
  tenant_id: string,
  data: { name?: string; slug?: string; locale?: string }
) {
  return backendPatch<AdminTenant>(`/admin/tenants/${tenant_id}`, token, data);
}

export async function adminRefreshTenant(
  token: string,
  tenant_id: string
) {
  return backendPost<{
    run_id: string;
    tenant_id: string;
    status: string;
    rows_pulled: number;
    error_message: string | null;
  }>(`/admin/tenants/${tenant_id}/refresh`, token, {});
}

export async function adminListUsers(token: string) {
  return backendGet<AdminUser[]>("/admin/users", token);
}

export async function adminCreateUser(
  token: string,
  data: {
    email: string;
    name?: string;
    password: string;  // Required for creation
    role?: string;
    tenant_id?: string | null;
    project_ids?: string[];
  }
) {
  return backendPost<AdminUser>("/admin/users", token, data);
}

export async function adminUpdateUser(
  token: string,
  user_id: string,
  data: {
    name?: string | null;
    role?: string | null;
    tenant_id?: string | null;
    project_ids?: string[] | null;
    status?: string | null;
    password?: string;  // Optional password update
  }
) {
  return backendPatch<AdminUser>(`/admin/users/${user_id}`, token, data);
}

export type AdminProject = {
  id: string;
  name: string;
  tenant_id: string;
  slug: string;
  start_date: string | null;
  end_date: string | null;
  visit_count: number;
  client_name: string;
};

export async function adminListTenantProjects(
  token: string,
  tenantId: string
) {
  return backendGet<AdminProject[]>(
    `/admin/tenants/${tenantId}/projects`,
    token
  );
}

export async function adminUpdateProject(
  token: string,
  tenant_id: string,
  project_id: string,
  data: { name?: string; start_date?: string | null; end_date?: string | null; client_name?: string }
) {
  return backendPatch<AdminProject>(
    `/admin/tenants/${tenant_id}/projects/${project_id}`,
    token,
    data
  );
}

export async function adminListRunLogs(token: string) {
  return backendGet<AdminRunLog[]>("/admin/runs", token);
}

export async function adminGetPhotoSlots(
  token: string,
  project_id: string
) {
  return backendGet<PhotoSlotLabel[]>(
    `/admin/projects/${project_id}/photo-slots`,
    token
  );
}

export type PasswordResetIssueResult = {
  token: string;
  expires_at: string;
  user_id: string;
};

export async function adminIssuePasswordReset(
  token: string,
  user_id: string
): Promise<PasswordResetIssueResult> {
  return backendPost<PasswordResetIssueResult>(
    `/admin/users/${user_id}/password-reset`,
    token,
    {}
  );
}

export async function adminUpdatePhotoSlots(
  token: string,
  project_id: string,
  labels: PhotoSlotLabel[]
) {
  return backendPatch<PhotoSlotLabel[]>(
    `/admin/projects/${project_id}/photo-slots`,
    token,
    { labels }
  );
}

export type ProjectMetric = {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  category: string | null;
};

export async function adminGetProjectMetrics(
  token: string,
  project_id: string
) {
  return backendGet<ProjectMetric[]>(
    `/admin/projects/${project_id}/metrics`,
    token
  );
}

export async function adminUpdateProjectMetrics(
  token: string,
  project_id: string,
  metrics: ProjectMetric[]
) {
  return backendPatch<ProjectMetric[]>(
    `/admin/projects/${project_id}/metrics`,
    token,
    { metrics }
  );
}

export type ProviderConnection = {
  tenant_id: string;
  kind: string;
  status: string;
  display_name: string | null;
  base_url: string | null;
  client_id: string | null;
  has_client_secret: boolean;
  last_sync_at: string | null;
};

export async function adminGetConnection(
  token: string,
  tenant_id: string
): Promise<ProviderConnection | null> {
  try {
    return await backendGet<ProviderConnection>(
      `/admin/tenants/${tenant_id}/shopmetrics-connection`,
      token
    );
  } catch {
    return null;
  }
}

export async function adminUpdateConnectionDisplayName(
  token: string,
  tenant_id: string,
  display_name: string | null,
  existing: ProviderConnection
): Promise<ProviderConnection> {
  // PATCH requires base_url + client_id; preserve existing values, only change display_name.
  return backendPatch<ProviderConnection>(
    `/admin/tenants/${tenant_id}/shopmetrics-connection`,
    token,
    {
      base_url: existing.base_url ?? "",
      client_id: existing.client_id ?? "",
      status: existing.status,
      display_name,
    }
  );
}

export async function adminUpdateConnection(
  token: string,
  tenant_id: string,
  patch: { display_name?: string | null; status?: string; base_url?: string },
  existing: ProviderConnection
): Promise<ProviderConnection> {
  // Read-then-write merge: unspecified patch fields fall back to existing values.
  return backendPatch<ProviderConnection>(
    `/admin/tenants/${tenant_id}/shopmetrics-connection`,
    token,
    {
      base_url: patch.base_url ?? existing.base_url ?? "",
      client_id: existing.client_id ?? "",
      status: patch.status ?? existing.status,
      display_name: "display_name" in patch ? patch.display_name : existing.display_name,
    }
  );
}

export async function adminGetSetting(
  token: string,
  key: string
): Promise<{ key: string; value: string }> {
  return backendGet<{ key: string; value: string }>(
    `/admin/settings/${key}`,
    token
  );
}

export async function adminUpdateSetting(
  token: string,
  key: string,
  value: string
): Promise<{ key: string; value: string }> {
  return backendPatch<{ key: string; value: string }>(
    `/admin/settings/${key}`,
    token,
    { value }
  );
}