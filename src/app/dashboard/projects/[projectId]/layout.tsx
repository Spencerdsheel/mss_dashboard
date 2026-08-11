import { assertProjectAccess, requireSession } from "@/server/rbac";
import { ProjectHeader } from "./project-header";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const session = await requireSession();
  const { projectId } = await params;
  const { project } = await assertProjectAccess(projectId);

  const serializedProject = {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    startDate: project.startDate instanceof Date ? project.startDate.toISOString() : String(project.startDate),
    endDate: project.endDate instanceof Date ? project.endDate.toISOString() : String(project.endDate),
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ProjectHeader project={serializedProject} role={session.user.role} />
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
