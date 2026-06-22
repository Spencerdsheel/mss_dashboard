"use client";

import { memo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  ResponsiveContainer,
} from "recharts";

function shortDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function longDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-CA", { month: "short", day: "2-digit", year: "numeric" });
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #e8e8e8",
  background: "#ffffff",
  fontSize: 12,
  color: "#202020",
  boxShadow: "0 1px 3px rgba(32,32,32,0.08)",
} as const;

/** Visits-over-time area chart. */
export const TrendChart = memo(function TrendChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-xs text-slate">
        No data
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff682c" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#ff682c" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="0"
            stroke="#e8e8e8"
            strokeOpacity={0.8}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            stroke="#828282"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            fontFamily="var(--font-inter)"
            tickFormatter={shortDate}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#828282"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            fontFamily="var(--font-inter)"
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "#e8e8e8", strokeWidth: 1 }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [value, "Visits"]}
            labelFormatter={longDate}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#ff682c"
            strokeWidth={2}
            fill="url(#trendGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#ff682c", stroke: "#ffffff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

/** Cumulative installs vs optional target reference line. */
export const CumulativeChart = memo(function CumulativeChart({
  data,
  target,
}: {
  data: { date: string; cumulative: number }[];
  target: number | null;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-xs text-slate">
        No data
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff682c" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#ff682c" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="0"
            stroke="#e8e8e8"
            strokeOpacity={0.8}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            stroke="#828282"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            fontFamily="var(--font-inter)"
            tickFormatter={shortDate}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#828282"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            fontFamily="var(--font-inter)"
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "#e8e8e8", strokeWidth: 1 }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [value, "Cumulative"]}
            labelFormatter={longDate}
          />
          {target != null && target > 0 && (
            <ReferenceLine
              y={target}
              stroke="#828282"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{
                value: `Target ${target.toLocaleString()}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#828282",
                fontFamily: "var(--font-inter)",
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="#ff682c"
            strokeWidth={2}
            fill="url(#cumulativeGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#ff682c", stroke: "#ffffff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

/** Visits per city — horizontal bar, capped at 12 cities, sorted descending. */
export const LocationBarChart = memo(function LocationBarChart({
  data,
}: {
  data: { city: string; count: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-xs text-slate">
        No data
      </div>
    );
  }

  // Dynamic height: 28px per city + margins so labels don't crowd
  const chartHeight = Math.max(200, data.length * 28 + 24);

  return (
    <div style={{ height: chartHeight }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="0"
            stroke="#e8e8e8"
            strokeOpacity={0.8}
            vertical={true}
            horizontal={false}
          />
          <XAxis
            type="number"
            stroke="#828282"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            fontFamily="var(--font-inter)"
            allowDecimals={false}
          />
          <YAxis
            dataKey="city"
            type="category"
            stroke="#828282"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            fontFamily="var(--font-inter)"
            width={96}
          />
          <Tooltip
            cursor={{ fill: "#efefef" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [value, "Visits"]}
          />
          <Bar dataKey="count" fill="#ff682c" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
