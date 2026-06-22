import { getUsersAndTenants } from "./actions";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { users, tenants } = await getUsersAndTenants();

  return <UsersClient users={users} tenants={tenants} />;
}
