export function isProjectActive(project: { startDate: Date | null; endDate: Date | null }): boolean {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const start = project.startDate
    ? new Date(project.startDate.getFullYear(), project.startDate.getMonth(), project.startDate.getDate())
    : null;

  const end = project.endDate
    ? new Date(project.endDate.getFullYear(), project.endDate.getMonth(), project.endDate.getDate(), 23, 59, 59, 999)
    : null;

  if (start && todayStart < start) return false;
  if (end && todayEnd > end) return false;

  return true;
}
