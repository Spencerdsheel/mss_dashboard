"use client";

import { memo } from "react";

export const RankedLocationList = memo(function RankedLocationList({
  data,
}: {
  data: Array<{ city: string; count: number }>;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[440px] items-center justify-center text-xs text-muted-foreground">
        No location data
      </div>
    );
  }

  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const top10 = data.slice(0, 10);

  return (
    <div className="h-[440px] overflow-y-auto space-y-2 pr-1">
      {top10.map((d, i) => (
        <div key={d.city} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-right font-space-grotesk text-xs text-muted-foreground tabular-nums">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="truncate text-xs text-foreground">{d.city}</span>
              <span className="shrink-0 ml-2 font-space-grotesk text-xs text-muted-foreground tabular-nums">
                {d.count}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[#ff682c] transition-all duration-500"
                style={{ width: `${(d.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
