"use client";

import { memo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

// First segment = Signal Orange (success), rest = neutral Ventriloc tones
const COLORS = [
  "#ff682c", // Signal Orange — success / primary
  "#e8e8e8", // Chalk
  "#828282", // Slate
  "#d4d4d4",
  "#b0b0b0",
  "#c8c8c8",
  "#a0a0a0",
  "#bcbcbc",
  "#909090",
];

export const DonutChart = memo(function DonutChart({
  data,
  total,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number }[];
  total: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const safe = data.filter((d) => d.value > 0);
  return (
    <div className="relative h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e8e8e8",
              background: "#ffffff",
              fontSize: 12,
              color: "#202020",
              boxShadow: "0 1px 3px rgba(32,32,32,0.08)",
            }}
            formatter={(value: number, name) => [
              `${value} (${((value / total) * 100).toFixed(1)}%)`,
              name,
            ]}
          />
          <Pie
            data={safe}
            dataKey="value"
            nameKey="label"
            innerRadius={60}
            outerRadius={88}
            paddingAngle={2}
            stroke="#efefef"
            strokeWidth={2}
          >
            {safe.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[10px] uppercase tracking-widest text-slate">
          {centerLabel}
        </div>
        <div
          className="font-space-grotesk text-3xl text-carbon"
          style={{ letterSpacing: "-0.04em", lineHeight: 1 }}
        >
          {centerValue}
        </div>
      </div>
    </div>
  );
});

export const DonutLegend = memo(function DonutLegend({
  data,
  total,
}: {
  data: { label: string; value: number }[];
  total: number;
}) {
  return (
    <ul className="space-y-2 text-xs">
      {data.map((d, i) => (
        <li key={`${d.label}-${i}`} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="truncate text-graphite">{d.label}</span>
          </span>
          <span className="shrink-0 tabular-nums text-slate">
            {d.value} · {total ? ((d.value / total) * 100).toFixed(0) : 0}%
          </span>
        </li>
      ))}
    </ul>
  );
});
