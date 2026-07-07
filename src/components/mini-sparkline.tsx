"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function MiniSparkline({
  data,
  width,
  height = 32,
  color = "hsl(var(--primary))",
}: MiniSparklineProps) {
  if (!data.length) return null;

  const chartData = data.map((value, index) => ({ index, value }));

  return (
    <div style={{ width: width ?? "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
