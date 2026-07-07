"use client";

import { memo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { BAR_GRADIENT_LIGHT } from "@/lib/chart-helpers";

export const PhotoBarChart = memo(function PhotoBarChart({
  data,
}: {
  data: { slot: string; count: number }[];
}) {
  return (
    <div className="h-[380px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            {BAR_GRADIENT_LIGHT.map((color, i) => (
              <linearGradient key={i} id={`barGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={1} />
                <stop offset="100%" stopColor={color} stopOpacity={0.78} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="0"
            stroke="hsl(var(--border))"
            strokeOpacity={0.8}
            vertical={false}
          />
          <XAxis
            dataKey="slot"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            fontFamily="var(--font-inter)"
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            fontFamily="var(--font-inter)"
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              fontSize: 12,
              color: "hsl(var(--foreground))",
              boxShadow: "0 1px 3px rgba(32,32,32,0.08)",
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={`url(#barGrad${i % BAR_GRADIENT_LIGHT.length})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
