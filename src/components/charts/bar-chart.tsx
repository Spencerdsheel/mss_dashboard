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
} from "recharts";

export const PhotoBarChart = memo(function PhotoBarChart({
  data,
}: {
  data: { slot: string; count: number }[];
}) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="0"
            stroke="#e8e8e8"
            strokeOpacity={0.8}
            vertical={false}
          />
          <XAxis
            dataKey="slot"
            stroke="#828282"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            fontFamily="var(--font-inter)"
          />
          <YAxis
            stroke="#828282"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            fontFamily="var(--font-inter)"
          />
          <Tooltip
            cursor={{ fill: "#efefef" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e8e8e8",
              background: "#ffffff",
              fontSize: 12,
              color: "#202020",
              boxShadow: "0 1px 3px rgba(32,32,32,0.08)",
            }}
          />
          <Bar dataKey="count" fill="#ff682c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
