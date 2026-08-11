import type { LayoutConfig, WidgetSize } from "./dashboard-layout";

export const FREEFORM_COLS = 12;
export type FreeformWidgetInstance = { id: string; type: string; x: number; y: number; w: number; h: number; params?: Record<string, string | number> };
export type FreeformLayoutConfig = { version: 2; cols: number; widgets: FreeformWidgetInstance[] };

export function overlaps(a: FreeformWidgetInstance, b: FreeformWidgetInstance): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clampWidget(widget: FreeformWidgetInstance, cols: number): FreeformWidgetInstance {
  const w = Math.max(1, Math.min(Math.trunc(widget.w), cols));
  return { ...widget, x: Math.max(0, Math.min(Math.trunc(widget.x), cols - w)), y: Math.max(0, Math.trunc(widget.y)), w, h: Math.max(1, Math.trunc(widget.h)) };
}

function update(layout: FreeformLayoutConfig, id: string, candidate: FreeformWidgetInstance): FreeformLayoutConfig {
  const next = clampWidget(candidate, layout.cols);
  if (layout.widgets.some((widget) => widget.id !== id && overlaps(next, widget))) return layout;
  return { ...layout, widgets: layout.widgets.map((widget) => widget.id === id ? next : widget) };
}

export function moveFreeformWidget(layout: FreeformLayoutConfig, id: string, x: number, y: number): FreeformLayoutConfig {
  const widget = layout.widgets.find((item) => item.id === id);
  return widget ? update(layout, id, { ...widget, x, y }) : layout;
}

export function resizeFreeformWidget(layout: FreeformLayoutConfig, id: string, w: number, h: number): FreeformLayoutConfig {
  const widget = layout.widgets.find((item) => item.id === id);
  return widget ? update(layout, id, { ...widget, w, h }) : layout;
}

const SIZE_WIDTH: Record<WidgetSize, number> = { sm: 3, md: 4, lg: 8, xl: 12 };
const WIDTH_SIZE: Array<[number, WidgetSize]> = [[3, "sm"], [4, "md"], [8, "lg"], [12, "xl"]];

export function v1ToFreeform(layout: LayoutConfig): FreeformLayoutConfig {
  let x = 0; let y = 0;
  const widgets = layout.widgets.map((widget) => {
    const w = SIZE_WIDTH[widget.size];
    if (x + w > FREEFORM_COLS) { x = 0; y += 1; }
    const result = { id: widget.id, type: widget.type, x, y, w, h: 1, params: widget.params };
    x += w;
    return result;
  });
  return { version: 2, cols: FREEFORM_COLS, widgets };
}

export function freeformToV1(layout: FreeformLayoutConfig): LayoutConfig {
  return { version: 1, widgets: [...layout.widgets].sort((a, b) => a.y - b.y || a.x - b.x).map((widget) => ({
    id: widget.id, type: widget.type, size: WIDTH_SIZE.reduce((best, entry) => Math.abs(entry[0] - widget.w) < Math.abs(best[0] - widget.w) ? entry : best)[1], params: widget.params,
  })) };
}
