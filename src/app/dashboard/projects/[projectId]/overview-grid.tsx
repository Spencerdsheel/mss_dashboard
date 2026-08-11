"use client";

// Sprint 13a — thin wrapper: reads the stored layout (or the frozen default)
// and delegates rendering to WidgetGrid. All widget bodies live in
// src/components/dashboard-widgets.tsx, registered via
// src/lib/widget-registry.ts.
//
// Sprint 13b — adds admin edit mode: CLIENT_ADMIN/PLATFORM_ADMIN sessions get
// the WidgetEditorToolbar + WidgetGrid's editable path; a draft LayoutConfig
// is held in component state (§4.5) and only persisted on Save (via the
// server actions in dashboard-layout-actions.ts) or discarded on Cancel.
// Non-admins and non-edit-mode sessions render the exact 13a read-only grid.
// See .claude/specs/sprint-13b-widget-dashboard-editor.md.

import { useState } from "react";
import { WidgetGrid } from "@/components/widget-grid";
import { WidgetGridFreeform } from "@/components/widget-grid-freeform";
import { WidgetEditorToolbar } from "@/components/widget-editor-toolbar";
import {
  DEFAULT_LAYOUT,
  addWidgetToLayout,
  type LayoutConfig,
  type MetricEntry,
  type VisitChartRow,
} from "@/lib/dashboard-layout";
import { freeformToV1, v1ToFreeform, type FreeformLayoutConfig } from "@/lib/freeform-layout";
import type { InstallSlot } from "@/server/analytics";
import type { Role } from "@/types/role";
import {
  saveDashboardLayoutAction,
  resetDashboardLayoutAction,
  suggestLayoutAction,
} from "./dashboard-layout-actions";

export type { VisitChartRow };

export function OverviewGrid({
  projectId,
  totalVisits,
  uniqueStores,
  minDate,
  maxDate,
  installSlots,
  metrics,
  visitRows,
  dailyVisits,
  photoByKind,
  layout,
  role,
  aiLayoutGenerationEnabled = true,
}: {
  projectId: string;
  totalVisits: number;
  uniqueStores: number;
  minDate: string | null;
  maxDate: string | null;
  installSlots: InstallSlot[];
  metrics: MetricEntry[];
  visitRows: VisitChartRow[];
  dailyVisits: number[];
  photoByKind?: Record<string, number>;
  layout?: LayoutConfig | FreeformLayoutConfig | null;
  role?: Role;
  // Sprint 19 §6.5: frontend defense-in-depth only — hides the "Generate
  // overview page (AI)" button when the platform admin has disabled the
  // capability. The backend 403 on the suggest endpoint is the real gate.
  aiLayoutGenerationEnabled?: boolean;
}) {
  const savedLayout = layout ?? DEFAULT_LAYOUT;
  const isAdmin = role === "PLATFORM_ADMIN" || role === "CLIENT_ADMIN";

  const [renderedLayout, setRenderedLayout] = useState<LayoutConfig | FreeformLayoutConfig>(savedLayout);
  const [draft, setDraft] = useState<LayoutConfig | FreeformLayoutConfig>(savedLayout);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const data = {
    summary: { totalVisits, uniqueStores, minDate, maxDate },
    installSlots,
    metrics,
    visitRows,
    dailyVisits,
    photoByKind: photoByKind ?? {},
  };

  const renderGrid = (current: LayoutConfig | FreeformLayoutConfig, editable = false) => current.version === 2
    ? <WidgetGridFreeform layout={current} projectId={projectId} data={data} editable={editable} onChangeLayout={editable ? setDraft : undefined} />
    : <WidgetGrid layout={current} projectId={projectId} data={data} editable={editable} onChangeLayout={editable ? setDraft : undefined} />;

  if (!isAdmin) return renderGrid(renderedLayout);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WidgetEditorToolbar
        editing={editing}
        saving={saving}
        error={error}
        onStartEdit={() => {
          setDraft(renderedLayout);
          setError(null);
          setEditing(true);
        }}
        onAddWidget={(type) => setDraft((d) => d.version === 1 ? addWidgetToLayout(d, type) : d)}
        advanced={draft.version === 2}
        onToggleAdvanced={() => setDraft((d) => {
          if (d.version === 1) return v1ToFreeform(d);
          if (window.confirm("Switching back to standard layout mode will re-arrange widgets to the nearest standard size — this can't be perfectly undone. Continue?")) return freeformToV1(d);
          return d;
        })}
        onReset={async () => {
          setSaving(true);
          setError(null);
          try {
            await resetDashboardLayoutAction(projectId, "overview");
            setRenderedLayout(DEFAULT_LAYOUT);
            setDraft(DEFAULT_LAYOUT);
            setEditing(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Reset failed");
          } finally {
            setSaving(false);
          }
        }}
        onSave={async () => {
          setSaving(true);
          setError(null);
          try {
            const result = await saveDashboardLayoutAction(projectId, draft, "manual", "overview");
            setRenderedLayout(result.layout);
            setEditing(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
          } finally {
            setSaving(false);
          }
        }}
        onCancel={() => {
          setDraft(renderedLayout);
          setEditing(false);
          setError(null);
        }}
        onSuggestLayout={aiLayoutGenerationEnabled ? async () => {
          setSuggesting(true);
          setError(null);
          try {
            // Sprint 14/19 — preview-only: loads the AI-proposed full
            // overview page into the edit-mode draft for review. Does NOT
            // save/apply it — the admin still reviews and clicks Save to
            // persist (source: "ai_suggested" is set by the backend on that
            // PUT).
            const result = await suggestLayoutAction(projectId);
            setDraft(result.layout);
          } catch (e) {
            setError(e instanceof Error ? e.message : "AI suggestion failed");
          } finally {
            setSuggesting(false);
          }
        } : undefined}
        suggesting={suggesting}
      />
      <div className="min-h-0 flex-1">
        {renderGrid(editing ? draft : renderedLayout, editing)}
      </div>
    </div>
  );
}
