"use client";

import { memo } from "react";
import {
  FunnelChart as RechartsFunnel,
  Funnel,
  Cell,
  LabelList,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  fontSize: 12,
  color: "hsl(var(--foreground))",
  boxShadow: "0 1px 3px rgba(32,32,32,0.08)",
} as const;

export const PhotoFunnelChart = memo(function PhotoFunnelChart({
  data,
}: {
  data: Array<{ name: string; value: number; pct: string; fill: string }>;
}) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="flex h-[380px] items-center justify-center text-xs text-muted-foreground">
        No photo data
      </div>
    );
  }

  return (
    <div className="h-[380px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsFunnel margin={{ top: 8, right: 40, bottom: 8, left: 8 }}>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number, _name: string, props: { payload?: { pct?: string; name?: string } }) => [
              `${value} (${props.payload?.pct ?? ""})`,
              props.payload?.name ?? "",
            ]}
          />
          <Funnel dataKey="value" data={data} isAnimationActive>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
            <LabelList
              dataKey="name"
              position="left"
              fill="hsl(var(--muted-foreground))"
              fontSize={11}
              fontFamily="var(--font-inter)"
            />
            <LabelList
              dataKey="pct"
              position="right"
              fill="hsl(var(--muted-foreground))"
              fontSize={11}
              fontFamily="var(--font-inter)"
            />
          </Funnel>
        </RechartsFunnel>
      </ResponsiveContainer>
    </div>
  );
});
