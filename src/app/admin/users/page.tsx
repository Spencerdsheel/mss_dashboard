import { getUsersAndTenants } from "./actions";
import { UsersClient } from "./users-client";
import { requireAdminOrAbove } from "@/server/rbac";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireAdminOrAbove();
  const { users, tenants } = await getUsersAndTenants();

  return <UsersClient users={users} tenants={tenants} callerRole={session.user.role} />;
}
