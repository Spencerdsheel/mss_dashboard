"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { WIDGET_REGISTRY } from "@/lib/widget-registry";
import { moveFreeformWidget, resizeFreeformWidget, type FreeformLayoutConfig } from "@/lib/freeform-layout";
import type { WidgetDataPayload } from "@/lib/dashboard-layout";

export function WidgetGridFreeform({ layout, projectId, data, editable = false, onChangeLayout }: { layout: FreeformLayoutConfig; projectId: string; data: WidgetDataPayload; editable?: boolean; onChangeLayout?: (layout: FreeformLayoutConfig) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState(layout);
  const previewRef = useRef(layout);
  const active = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; widget: typeof layout.widgets[number] } | null>(null);
  useEffect(() => { previewRef.current = layout; setPreview(layout); }, [layout]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const action = active.current; const rect = ref.current?.getBoundingClientRect();
      if (!action || !rect) return;
      const dx = Math.round((event.clientX - action.startX) / (rect.width / layout.cols));
      const dy = Math.round((event.clientY - action.startY) / 60);
      const next = action.mode === "move" ? moveFreeformWidget(layout, action.id, action.widget.x + dx, action.widget.y + dy) : resizeFreeformWidget(layout, action.id, action.widget.w + dx, action.widget.h + dy);
      previewRef.current = next; setPreview(next);
    };
    const up = () => { if (active.current && onChangeLayout) onChangeLayout(previewRef.current); active.current = null; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [layout, onChangeLayout, preview]);
  return <div ref={ref} className="relative min-h-[240px]" style={{ display: "grid", gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridAutoRows: "60px", gap: "0.5rem" }}>
    {preview.widgets.map((widget) => { const def = WIDGET_REGISTRY[widget.type]; if (!def) return null; const Component = def.component; return <div key={widget.id} className="relative min-h-0" style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }}>
      {editable && <><button type="button" aria-label={`Drag ${widget.id}`} className="absolute left-1 top-1 z-20 cursor-grab rounded bg-popover/90 p-1" onPointerDown={(event) => { event.preventDefault(); active.current = { id: widget.id, mode: "move", startX: event.clientX, startY: event.clientY, widget }; }}><GripVertical className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Resize ${widget.id}`} className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-se-resize bg-[#ff682c]" onPointerDown={(event) => { event.preventDefault(); active.current = { id: widget.id, mode: "resize", startX: event.clientX, startY: event.clientY, widget }; }} /></>}
      <Component projectId={projectId} data={data} params={widget.params} className="h-full w-full" />
    </div>; })}
  </div>;
}
