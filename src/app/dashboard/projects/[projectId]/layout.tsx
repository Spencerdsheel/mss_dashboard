import { assertProjectAccess, requireSession } from "@/server/rbac";
import { AppShell } from "@/components/app-shell";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const session = await requireSession();
  const { projectId } = await params;
  await assertProjectAccess(projectId);
  return (
    <AppShell session={session as any} projectId={projectId}>
      {children}
    </AppShell>
  );
}
