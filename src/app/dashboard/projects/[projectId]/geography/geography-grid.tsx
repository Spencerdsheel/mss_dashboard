"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { MapPin, BarChart3, TrendingUp } from "lucide-react";

const GeoHeatMap = dynamic(
  () => import("@/components/charts/geo-heat-map").then((m) => m.GeoHeatMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading map...
      </div>
    ),
  }
);

export function GeographyGrid({
  projectId,
  locationData,
  totalVisits,
  visitsWithCity,
}: {
  projectId: string;
  locationData: Array<{ city: string; count: number }>;
  totalVisits: number;
  visitsWithCity: number;
}) {
  const router = useRouter();
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);

  const topCity = locationData[0];
  const uniqueCities = locationData.length;
  const avgPerCity = uniqueCities > 0 ? Math.round(visitsWithCity / uniqueCities) : 0;
  const topCityPct = topCity && visitsWithCity > 0
    ? Math.round((topCity.count / visitsWithCity) * 100)
    : 0;

  const mapData = useMemo(
    () => locationData.slice(0, 30),
    [locationData]
  );

  const rankedData = useMemo(
    () => locationData.slice(0, 12),
    [locationData]
  );

  const maxCount = Math.max(1, ...rankedData.map((d) => d.count));

  const handleCityHover = useCallback((city: string | null) => {
    setHoveredCity(city);
  }, []);

  return (
    <div className="grid h-full grid-cols-12 gap-3 overflow-hidden" style={{ gridTemplateRows: "92px minmax(0,1fr)" }}>
      {/* ── ROW 1: Geo KPI Cards ── */}
      <GeoKpi
        className="col-span-4"
        icon={<MapPin className="h-4 w-4" />}
        label="Cities"
        value={uniqueCities.toString()}
        sub="with visits"
      />
      <GeoKpi
        className="col-span-4"
        icon={<TrendingUp className="h-4 w-4" />}
        label="Top City"
        value={topCity ? topCity.city : "—"}
        sub={topCity ? `${topCityPct}% of visits` : ""}
      />
      <GeoKpi
        className="col-span-4"
        icon={<BarChart3 className="h-4 w-4" />}
        label="Avg / City"
        value={avgPerCity.toString()}
        sub="visits per city"
      />

      {/* ── ROW 2: Map Hero (col 1-8) + Ranked Cities (col 9-12) ── */}
      <div className="col-span-8 card-ventriloc flex flex-col p-3 min-h-0">
        <span className="text-sm font-medium text-foreground shrink-0">Geographic Distribution</span>
        <div className="flex-1 min-h-0 mt-1">
          <GeoHeatMap data={mapData} hoveredCity={hoveredCity} onCityHover={handleCityHover} />
        </div>
      </div>

      <div className="col-span-4 card-ventriloc flex flex-col p-3 min-h-0">
        <div className="flex items-center justify-between shrink-0 mb-2">
          <span className="text-sm font-medium text-foreground">Ranked Cities</span>
          <span className="text-[10px] text-muted-foreground">
            {rankedData.length} of {locationData.length}
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
          {rankedData.map((d, i) => (
            <button
              key={d.city}
              className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                hoveredCity === d.city
                  ? "bg-[#ff682c]/10 border border-[#ff682c]/30"
                  : "hover:bg-muted/50 border border-transparent"
              }`}
              onMouseEnter={() => handleCityHover(d.city)}
              onMouseLeave={() => handleCityHover(null)}
              onClick={() => router.push(`/dashboard/projects/${projectId}/visits?city=${encodeURIComponent(d.city)}`)}
            >
              <span className="text-[10px] text-muted-foreground w-4 tabular-nums">{i + 1}</span>
              <span className="text-[11px] text-foreground flex-1 truncate">{d.city}</span>
              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                <div
                  className="h-full rounded-full bg-[#ff682c] transition-all duration-300"
                  style={{ width: `${(d.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground w-6 text-right shrink-0">{d.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GeoKpi({
  icon,
  label,
  value,
  sub,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  className?: string;
}) {
  return (
    <div className={`card-ventriloc p-3 flex flex-col justify-between ${className ?? ""}`}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="text-signal-orange">{icon}</span>
      </div>
      <div
        className="mt-1 font-space-grotesk text-2xl text-foreground truncate"
        style={{ letterSpacing: "-0.03em" }}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
