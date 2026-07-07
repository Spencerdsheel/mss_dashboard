"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info } from "lucide-react";

const COLORS = [
  "#ff682c",
  "#e8e8e8",
  "#828282",
  "#d4d4d4",
  "#b0b0b0",
  "#c8c8c8",
  "#a0a0a0",
  "#bcbcbc",
  "#909090",
];

export function DistributionPopover({
  data,
  total,
}: {
  data: Array<{ label: string; value: number; is_success: boolean }>;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          aria-label="View distribution details"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3"
        align="end"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="text-xs font-medium text-foreground mb-2">
          Distribution
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal pb-1">Label</th>
              <th className="text-right font-normal pb-1">Count</th>
              <th className="text-right font-normal pb-1">%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={`${d.label}-${i}`} className="border-t border-border/50">
                <td className="py-1 flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate text-foreground">{d.label}</span>
                </td>
                <td className="text-right tabular-nums text-muted-foreground py-1">
                  {d.value}
                </td>
                <td className="text-right tabular-nums text-muted-foreground py-1">
                  {total ? ((d.value / total) * 100).toFixed(0) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PopoverContent>
    </Popover>
  );
}
