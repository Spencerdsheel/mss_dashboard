"use client";

import { memo } from "react";
import { Camera } from "lucide-react";

const SLOT_ORDER = [
  { key: "STOREFRONT", label: "SF" },
  { key: "PHOTO_1", label: "P1" },
  { key: "PHOTO_2", label: "P2" },
  { key: "PHOTO_3", label: "P3" },
  { key: "PHOTO_4", label: "P4" },
  { key: "PHOTO_5", label: "P5" },
  { key: "PHOTO_6", label: "P6" },
  { key: "PHOTO_7", label: "P7" },
  { key: "PHOTO_8", label: "P8" },
  { key: "PHOTO_9", label: "P9" },
];

export const EvidenceStrip = memo(function EvidenceStrip({
  photoByKind,
  totalVisits,
  rowsWithNoPhotos,
}: {
  photoByKind: Record<string, number>;
  totalVisits: number;
  rowsWithNoPhotos: number;
}) {
  const maxSlotCount = Math.max(1, ...SLOT_ORDER.map((s) => photoByKind[s.key] ?? 0));

  return (
    <div className="card-ventriloc flex items-center gap-3 px-4 py-2.5 shrink-0">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
        <Camera className="h-3.5 w-3.5 text-[#ff682c]" />
        <span className="font-medium text-foreground">Photo Evidence</span>
      </div>
      <div className="flex items-center gap-2 flex-1 overflow-x-auto">
        {SLOT_ORDER.map((slot) => {
          const count = photoByKind[slot.key] ?? 0;
          const pct = totalVisits > 0 ? (count / totalVisits) * 100 : 0;
          const barH = Math.max(4, (count / maxSlotCount) * 28);
          return (
            <div key={slot.key} className="flex items-end gap-1 shrink-0" title={`${slot.label}: ${count} (${pct.toFixed(0)}%)`}>
              <div className="flex flex-col items-center gap-0.5">
                <div className="w-3 bg-muted rounded-sm overflow-hidden" style={{ height: 28 }}>
                  <div
                    className="w-full bg-[#ff682c] rounded-sm mt-auto"
                    style={{ height: barH, marginTop: 28 - barH }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground">{slot.label}</span>
              </div>
              <span className="text-[10px] tabular-nums text-foreground mb-2">{count}</span>
            </div>
          );
        })}
      </div>
      {rowsWithNoPhotos > 0 && (
        <div className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground shrink-0">
          {rowsWithNoPhotos} without photos
        </div>
      )}
    </div>
  );
});
