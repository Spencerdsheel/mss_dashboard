"use client";

import { memo } from "react";
import {
  RadarChart as RechartsRadar,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  fontSize: 12,
  color: "hsl(var(--foreground))",
  boxShadow: "0 1px 3px rgba(32,32,32,0.08)",
} as const;

const BANNER_COLORS = [
  "#ff682c", "#4a90d9", "#50c878", "#9b59b6", "#f39c12", "#1abc9c",
];

export const BannerRadarChart = memo(function BannerRadarChart({
  data,
  banners,
}: {
  data: Array<{ metric: string; [banner: string]: string | number }>;
  banners: string[];
}) {
  if (data.length === 0 || banners.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No banner data
      </div>
    );
  }

  return (
    <div className="relative h-full w-full min-h-0">
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadar cx="50%" cy="50%" outerRadius="80%" data={data}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis
              dataKey="metric"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              fontFamily="var(--font-inter)"
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              stroke="hsl(var(--muted-foreground))"
              fontSize={9}
              tickCount={4}
            />
            {banners.map((banner, i) => (
              <Radar
                key={banner}
                name={banner}
                dataKey={banner}
                stroke={BANNER_COLORS[i % BANNER_COLORS.length]}
                fill={BANNER_COLORS[i % BANNER_COLORS.length]}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </RechartsRadar>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
