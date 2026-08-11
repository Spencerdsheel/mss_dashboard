import { describe, expect, it } from "vitest";
import { freeformToV1, moveFreeformWidget, resizeFreeformWidget, v1ToFreeform } from "@/lib/freeform-layout";
import { DEFAULT_LAYOUT } from "@/lib/dashboard-layout";

describe("freeform layout", () => {
  it("converts v1 to the 12-column freeform grid and back", () => {
    const freeform = v1ToFreeform(DEFAULT_LAYOUT);
    expect(freeform.version).toBe(2);
    expect(freeform.cols).toBe(12);
    expect(freeformToV1(freeform).widgets.map((w) => w.id)).toEqual(DEFAULT_LAYOUT.widgets.map((w) => w.id));
  });
  it("clamps moves and refuses collisions", () => {
    const layout = { version: 2 as const, cols: 12, widgets: [{ id: "a", type: "kpi-total-visits", x: 0, y: 0, w: 3, h: 1 }, { id: "b", type: "top-locations", x: 4, y: 0, w: 4, h: 1 }] };
    expect(moveFreeformWidget(layout, "a", 11, -2).widgets[0]).toMatchObject({ x: 9, y: 0 });
    expect(moveFreeformWidget(layout, "a", 4, 0)).toEqual(layout);
  });
  it("clamps resize to canvas bounds and refuses overlapping resize", () => {
    const layout = { version: 2 as const, cols: 12, widgets: [{ id: "a", type: "kpi-total-visits", x: 0, y: 0, w: 3, h: 1 }, { id: "b", type: "top-locations", x: 4, y: 0, w: 4, h: 1 }] };
    const standalone = { ...layout, widgets: [layout.widgets[0]] };
    expect(resizeFreeformWidget(standalone, "a", 20, 2).widgets[0]).toMatchObject({ w: 12, h: 2 });
    expect(resizeFreeformWidget(layout, "a", 5, 1)).toEqual(layout);
  });
});
