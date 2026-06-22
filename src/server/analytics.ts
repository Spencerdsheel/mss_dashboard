import { backendGet } from "./backend-api";

export type DistributionEntry = { label: string; value: number; is_success: boolean };

export type InstallSlot = {
  slot_index: number;
  title: string;
  question: string;
  target: number | null;
  success_count: number;
  distribution: DistributionEntry[];
};

export async function getProjectSummary(projectId: string, token: string) {
  const summary = await backendGet<{
    project_id: string;
    total_visits: number;
    unique_stores: number;
    min_date: string | null;
    max_date: string | null;
    client_name: string;
    metrics: Array<{ key: string; label: string; value: number; unit?: string; category?: string }>;
    install_slots: InstallSlot[];
    photo_by_kind: Record<string, number>;
    rows_with_no_photos: number;
  }>(`/projects/${projectId}/summary`, token);

  return {
    totalVisits: summary.total_visits,
    uniqueStores: summary.unique_stores,
    minDate: summary.min_date,
    maxDate: summary.max_date,
    installSlots: summary.install_slots ?? [],
    photoByKind: summary.photo_by_kind,
    rowsWithNoPhotos: summary.rows_with_no_photos,
    metrics: summary.metrics,
    provider: null,
  };
}
