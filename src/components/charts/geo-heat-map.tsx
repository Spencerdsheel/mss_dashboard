"use client";

import { memo, useMemo, useEffect, useState } from "react";
import { geoMercator, geoPath, geoCentroid } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { CITY_COORDS } from "@/lib/geo-data";

const MAP_WIDTH = 800;
const MAP_HEIGHT = 500;
const PADDING = 40;
const MIN_SPAN_DEG = 2;

export const GeoHeatMap = memo(function GeoHeatMap({
  data,
  hoveredCity,
  onCityHover,
}: {
  data: Array<{ city: string; count: number }>;
  hoveredCity?: string | null;
  onCityHover?: (city: string | null) => void;
}) {
  const [worldData, setWorldData] = useState<GeoPermissibleObjects[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    fetch("/world-110m.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load map data: ${r.status}`);
        return r.json();
      })
      .then((topo: Topology) => {
        if (cancelled) return;
        const countries = feature(topo, topo.objects.countries);
        setWorldData((countries as { type: string; features: GeoPermissibleObjects[] }).features);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const { mapped, unmappedCount, maxCount } = useMemo(() => {
    let unmapped = 0;
    let max = 0;
    const items: Array<{ city: string; count: number; lng: number; lat: number }> = [];
    for (const d of data) {
      const coords = CITY_COORDS[d.city];
      if (!coords) {
        unmapped += d.count;
        continue;
      }
      items.push({ city: d.city, count: d.count, lng: coords[0], lat: coords[1] });
      if (d.count > max) max = d.count;
    }
    return { mapped: items, unmappedCount: unmapped, maxCount: Math.max(1, max) };
  }, [data]);

  const projection = useMemo(() => {
    if (mapped.length === 0) return null;

    const lngs = mapped.map((c) => c.lng);
    const lats = mapped.map((c) => c.lat);
    let minLng = Math.min(...lngs);
    let maxLng = Math.max(...lngs);
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);

    const lngSpan = maxLng - minLng;
    const latSpan = maxLat - minLat;
    if (lngSpan < MIN_SPAN_DEG) {
      const mid = (minLng + maxLng) / 2;
      minLng = mid - MIN_SPAN_DEG;
      maxLng = mid + MIN_SPAN_DEG;
    }
    if (latSpan < MIN_SPAN_DEG) {
      const mid = (minLat + maxLat) / 2;
      minLat = mid - MIN_SPAN_DEG;
      maxLat = mid + MIN_SPAN_DEG;
    }

    const padLng = (maxLng - minLng) * 0.15;
    const padLat = (maxLat - minLat) * 0.15;
    minLng -= padLng;
    maxLng += padLng;
    minLat -= padLat;
    maxLat += padLat;

    const proj = geoMercator().fitExtent(
      [
        [PADDING, PADDING],
        [MAP_WIDTH - PADDING, MAP_HEIGHT - PADDING],
      ],
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [minLng, minLat],
              [maxLng, minLat],
              [maxLng, maxLat],
              [minLng, maxLat],
              [minLng, minLat],
            ],
          ],
        },
      }
    );
    return { proj, center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2] as [number, number], span: Math.max(maxLng - minLng, maxLat - minLat) };
  }, [mapped]);

  const proj = projection?.proj ?? null;

  const pathGenerator = useMemo(
    () => (proj ? geoPath().projection(proj) : null),
    [proj]
  );

  const nearbyCountries = useMemo(() => {
    if (!worldData || !projection) return [];
    const maxDist = projection.span * 1.5;
    const [cx, cy] = projection.center;
    return worldData.filter((geo) => {
      try {
        const [lng, lat] = geoCentroid(geo);
        return Math.abs(lng - cx) < maxDist && Math.abs(lat - cy) < maxDist;
      } catch { return false; }
    });
  }, [worldData, projection]);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No location data
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>Could not load map data</span>
        <button
          className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted transition-colors"
          onClick={() => setRetryKey((k) => k + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!worldData || !proj || !pathGenerator) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading map...
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <defs>
          <clipPath id="map-clip">
            <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} />
          </clipPath>
        </defs>

        <g clipPath="url(#map-clip)">
          {nearbyCountries.map((geo, i) => (
            <path
              key={i}
              d={pathGenerator(geo) ?? ""}
              fill="hsl(var(--muted))"
              stroke="hsl(var(--border))"
              strokeWidth={0.5}
            />
          ))}

          {mapped.map((city) => {
            const point = proj([city.lng, city.lat]);
            if (!point) return null;
            const r = 4 + Math.sqrt(city.count / maxCount) * 16;
            const isHovered = hoveredCity === city.city;
            return (
              <g
                key={city.city}
                onMouseEnter={() => onCityHover?.(city.city)}
                onMouseLeave={() => onCityHover?.(null)}
                style={{ cursor: "pointer" }}
              >
                {isHovered && (
                  <circle
                    cx={point[0]}
                    cy={point[1]}
                    r={r + 4}
                    fill="none"
                    stroke="#ff682c"
                    strokeWidth={2}
                    opacity={0.6}
                  >
                    <animate attributeName="r" from={String(r + 2)} to={String(r + 8)} dur="1s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.6" to="0" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={point[0]}
                  cy={point[1]}
                  r={isHovered ? r + 2 : r}
                  fill="#ff682c"
                  fillOpacity={isHovered ? 0.8 : 0.5}
                  stroke="#ff682c"
                  strokeWidth={isHovered ? 1.5 : 0.8}
                />
                <title>{`${city.city}: ${city.count} visits`}</title>
              </g>
            );
          })}
        </g>
      </svg>
      {unmappedCount > 0 && (
        <div className="absolute bottom-2 right-2 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
          {unmappedCount} visits in unmapped cities
        </div>
      )}
    </div>
  );
});
