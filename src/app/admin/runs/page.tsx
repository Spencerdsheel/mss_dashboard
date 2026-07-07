import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RunLogList } from "@/components/admin/run-log-list";
import { requireAdmin } from "@/server/rbac";

export const dynamic = "force-dynamic";

export default async function AdminRunsPage() {
  await requireAdmin();
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";

  if (!token) {
    redirect("/login");
  }

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Run History</h1>
          <p className="text-sm text-muted-foreground">
            Sync run logs for all tenants.
          </p>
        </div>
      </div>
      <RunLogList token={token} />
    </div>
  );
}
