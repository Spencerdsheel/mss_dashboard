import { backendGet } from "@/server/backend-api";
import { cookies } from "next/headers";
import { TenantList } from "@/components/admin/tenant-list";
import { requireAdminOrAbove } from "@/server/rbac";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdminOrAbove();

  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  const [tenants, users] = await Promise.all([
    backendGet<Array<{ id: string; name: string; slug: string; country: string; status: string }>>(
      "/admin/tenants",
      token
    ),
    backendGet<Array<{ id: string; email: string; name: string; role: string; tenant_ids: string[] }>>(
      "/admin/users",
      token
    ),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="font-space-grotesk text-3xl font-normal tracking-tight text-foreground"
          style={{ letterSpacing: "-0.04em" }}
        >
          Admin
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Backend configuration, tenants, and data sync status.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card-ventriloc p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Active Tenants
          </div>
          <div
            className="mt-2 font-space-grotesk text-3xl font-medium text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            {tenants.filter((t) => t.status === "active").length}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{tenants.length} total</div>
        </div>
        <div className="card-ventriloc p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Users</div>
          <div
            className="mt-2 font-space-grotesk text-3xl font-medium text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            {users.length}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">across all tenants</div>
        </div>
      </div>

      <TenantList tenants={tenants} token={token} />
    </div>
  );
}
