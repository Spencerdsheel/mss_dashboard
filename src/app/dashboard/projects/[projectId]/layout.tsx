import { assertProjectAccess, requireSession } from "@/server/rbac";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  await requireSession();
  const { projectId } = await params;
  await assertProjectAccess(projectId);
  return <>{children}</>;
}
