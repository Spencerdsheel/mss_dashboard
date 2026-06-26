import { listVisibleProjects } from "@/server/rbac";
import { ProjectGrid } from "./project-grid";

export const dynamic = "force-dynamic";

export default async function DashboardIndex() {
  const projects = await listVisibleProjects();

  return <ProjectGrid projects={projects} />;
}