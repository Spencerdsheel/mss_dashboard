import { requireAdmin } from "@/server/rbac";
import { cookies } from "next/headers";
import { CompaniesClient } from "./companies-client";
import { adminListCompanies, adminListTenants } from "@/server/admin-api";

export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage() {
  await requireAdmin();
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value || "";
  const [companies, tenants] = await Promise.all([
    adminListCompanies(token),
    adminListTenants(token),
  ]);
  return <CompaniesClient companies={companies} tenants={tenants} />;
}
