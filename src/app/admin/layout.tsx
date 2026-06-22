import { requireAdmin } from "@/server/rbac";
import { AppShell } from "@/components/app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return <AppShell session={session as any}>{children}</AppShell>;
}
