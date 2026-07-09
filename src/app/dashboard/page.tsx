import { listVisibleProjects } from "@/server/rbac";
import { ProjectGrid } from "./project-grid";
import { ParticlesBg } from "@/components/particles-bg";

export const dynamic = "force-dynamic";

export default async function DashboardIndex() {
  const projects = await listVisibleProjects();

  return (
    <div className="relative min-h-full">
      <ParticlesBg />
      <div className="relative z-10">
        <ProjectGrid projects={projects} />
      </div>
    </div>
  );
}