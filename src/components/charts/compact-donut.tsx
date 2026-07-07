"use client";

import { memo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { DistributionPopover } from "@/components/charts/distribution-popover";

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

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  fontSize: 12,
  color: "hsl(var(--foreground))",
  boxShadow: "0 1px 3px rgba(32,32,32,0.08)",
} as const;

export const CompactDonut = memo(function CompactDonut({
  title,
  data,
  total,
  successCount,
  target,
  onClick,
}: {
  title: string;
  data: Array<{ label: string; value: number; is_success: boolean }>;
  total: number;
  successCount: number;
  target?: number | null;
  onClick?: () => void;
}) {
  const pct = total ? Math.round((successCount / total) * 100) : 0;
  const safe = data.filter((d) => d.value > 0);

  return (
    <div
      className="card-ventriloc flex flex-col p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#ff682c]/30 cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      aria-label={`${title}: ${pct}% installed, ${successCount} of ${total}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground truncate">
          {title}
        </span>
        <DistributionPopover data={data} total={total} />
      </div>
      <div className="flex items-center gap-3 flex-1 min-h-0">
        <div className="relative w-[110px] h-[110px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number, name) => [
                  `${value} (${((value / total) * 100).toFixed(1)}%)`,
                  name,
                ]}
              />
              <Pie
                data={safe}
                dataKey="value"
                nameKey="label"
                innerRadius={32}
                outerRadius={50}
                paddingAngle={2}
                stroke="hsl(var(--card))"
                strokeWidth={2}
              >
                {safe.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="font-space-grotesk text-xl text-foreground"
              style={{ letterSpacing: "-0.04em", lineHeight: 1 }}
            >
              {pct}%
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <div className="text-lg font-space-grotesk text-foreground tabular-nums" style={{ letterSpacing: "-0.03em" }}>
            {successCount.toLocaleString()}
          </div>
          <div className="text-[10px] text-muted-foreground">
            of {total.toLocaleString()}
          </div>
          {target != null && target > 0 && (
            <div className="text-[10px] text-muted-foreground">
              Target: {target.toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
