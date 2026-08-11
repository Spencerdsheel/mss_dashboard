"use client";

// Sprint 13b — the top-level edit-mode toolbar: Edit toggle, Add widget,
// Reset to default, Save/Cancel. Per-widget affordances (move/resize/swap/
// remove) live inline in widget-grid.tsx's editable path. Rendered only for
// CLIENT_ADMIN/PLATFORM_ADMIN sessions (defense-in-depth — the backend route
// guard in services/api/routes/admin.py is the real gate, per rbac-model).
//
// Sprint 19 — "Suggest layout (AI)" relabeled "Generate overview page (AI)"
// to match the broader framing (same button, same action, same endpoint).
// The parent (overview-grid.tsx) passes onSuggestLayout as undefined when
// the platform admin has disabled ai_layout_generation_enabled, which hides
// the button entirely (defense-in-depth only — the backend 403 is the real
// gate, see .claude/specs/sprint-19-ai-full-page-generation.md §6.5).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WIDGET_REGISTRY } from "@/lib/widget-registry";

export function WidgetEditorToolbar({
  editing,
  saving,
  error,
  onStartEdit,
  onAddWidget,
  onReset,
  onSave,
  onCancel,
  onSuggestLayout,
  suggesting,
  advanced,
  onToggleAdvanced,
}: {
  editing: boolean;
  saving?: boolean;
  error?: string | null;
  onStartEdit: () => void;
  onAddWidget: (type: string) => void;
  onReset: () => void;
  onSave: () => void;
  onCancel: () => void;
  // Sprint 14 — optional: only rendered when the parent wires it up (admin
  // edit mode). Fetches an AI-proposed layout into the edit-mode draft for
  // review; never auto-applies (the admin still clicks Save).
  onSuggestLayout?: () => void;
  suggesting?: boolean;
  advanced?: boolean;
  onToggleAdvanced?: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center justify-end pb-2">
        <Button variant="outline" size="sm" onClick={onStartEdit}>
          Edit dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Editing dashboard layout</span>

        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setAddOpen((v) => !v)} disabled={saving}>
            + Add widget
          </Button>
          {addOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-border bg-popover p-1 shadow-md">
              {Object.values(WIDGET_REGISTRY).map((def) => (
                <button
                  key={def.type}
                  type="button"
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onAddWidget(def.type);
                    setAddOpen(false);
                  }}
                >
                  {def.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={onReset} disabled={saving}>
          Reset to default
        </Button>
        {onToggleAdvanced && <Button variant="outline" size="sm" onClick={onToggleAdvanced} disabled={saving}>{advanced ? "Standard layout mode" : "Advanced layout mode"}</Button>}

        {onSuggestLayout && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSuggestLayout}
            disabled={saving || suggesting}
          >
            {suggesting ? "Generating…" : "Generate overview page (AI)"}
          </Button>
        )}

        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
