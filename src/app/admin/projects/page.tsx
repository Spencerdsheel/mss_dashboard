import { getProjectsData } from "./actions";
import { ProjectsClient } from "./projects-client";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const data = await getProjectsData();

  return (
    <ProjectsClient
      tenants={data.tenants}
      projectsByTenant={data.projectsByTenant}
    />
  );
}
