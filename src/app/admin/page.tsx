import { backendGet } from "@/server/backend-api";
import { cookies } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TenantList } from "@/components/admin/tenant-list";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireAdminOrAbove } from "@/server/rbac";
import { ROLE_LABELS } from "@/types/role";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireAdminOrAbove();
  const role = session.user.role;
  const isPlatformAdmin = role === "PLATFORM_ADMIN";

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Backend configuration, tenants, and data sync status.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/users">
            <Button variant="outline">Manage Users</Button>
          </Link>
          <Link href="/admin/projects">
            <Button variant="outline">Projects</Button>
          </Link>
          <Link href="/admin/photo-slots">
            <Button variant="outline">Photo Slots</Button>
          </Link>
          <Link href="/admin/metrics">
            <Button variant="outline">Metric Targets</Button>
          </Link>
          {isPlatformAdmin && (
            <Link href="/admin/connections">
              <Button variant="outline">Connections</Button>
            </Link>
          )}
          {isPlatformAdmin && (
            <Link href="/admin/runs">
              <Button variant="outline">Run History</Button>
            </Link>
          )}
          {isPlatformAdmin && (
            <Link href="/admin/settings">
              <Button variant="outline">Settings</Button>
            </Link>
          )}
        </div>
      </div>

      <TenantList tenants={tenants} token={token} />

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>User accounts configured in the backend.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                <th className="py-2">Email</th>
                <th>Role</th>
                <th>Tenants</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const assignedNames = (u.tenant_ids ?? [])
                  .map((tid) => tenants.find((t) => t.id === tid)?.name ?? tid)
                  .join(", ") || "—";
                return (
                  <tr key={u.id} className="border-b last:border-b-0">
                    <td className="py-2">{u.email}</td>
                    <td>
                      <Badge variant={u.role === "PLATFORM_ADMIN" ? "brand" : "secondary"}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="text-xs">{assignedNames}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

    </div>
  );
}
