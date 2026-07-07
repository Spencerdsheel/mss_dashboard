"use client";

import { memo, useMemo, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { CITY_COORDS } from "@/lib/geo-data";

const HEAT_COLORS = [
  "#22c55e",
  "#84cc16",
  "#eab308",
  "#f97316",
  "#ef4444",
];

function heatColor(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio));
  const idx = t * (HEAT_COLORS.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, HEAT_COLORS.length - 1);
  const frac = idx - lo;
  const a = HEAT_COLORS[lo];
  const b = HEAT_COLORS[hi];
  const r = Math.round(parseInt(a.slice(1, 3), 16) * (1 - frac) + parseInt(b.slice(1, 3), 16) * frac);
  const g = Math.round(parseInt(a.slice(3, 5), 16) * (1 - frac) + parseInt(b.slice(3, 5), 16) * frac);
  const bl = Math.round(parseInt(a.slice(5, 7), 16) * (1 - frac) + parseInt(b.slice(5, 7), 16) * frac);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, bounds]);
  return null;
}

export const GeoHeatMap = memo(function GeoHeatMap({
  data,
  hoveredCity,
  onCityHover,
}: {
  data: Array<{ city: string; count: number }>;
  hoveredCity?: string | null;
  onCityHover?: (city: string | null) => void;
}) {
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

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (mapped.length === 0) return null;
    const lats = mapped.map((c) => c.lat);
    const lngs = mapped.map((c) => c.lng);
    return [
      [Math.min(...lats) - 1, Math.min(...lngs) - 1],
      [Math.max(...lats) + 1, Math.max(...lngs) + 1],
    ];
  }, [mapped]);

  if (data.length === 0 || !bounds) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No location data
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        bounds={bounds}
        scrollWheelZoom={true}
        zoomControl={true}
        style={{ height: "100%", width: "100%", borderRadius: "8px" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds bounds={bounds} />

        {mapped.map((city) => {
          const ratio = city.count / maxCount;
          const radius = 8 + ratio * 18;
          const color = heatColor(ratio);
          const isHovered = hoveredCity === city.city;

          return (
            <CircleMarker
              key={city.city}
              center={[city.lat, city.lng]}
              radius={isHovered ? radius + 4 : radius}
              pathOptions={{
                color: color,
                weight: isHovered ? 2.5 : 1.5,
                fillColor: color,
                fillOpacity: isHovered ? 0.6 : 0.35,
              }}
              eventHandlers={{
                mouseover: () => onCityHover?.(city.city),
                mouseout: () => onCityHover?.(null),
              }}
            >
              <Tooltip direction="top" offset={[0, -radius]} opacity={0.95}>
                <div style={{ fontFamily: "var(--font-inter)", fontSize: 12 }}>
                  <strong>{city.city}</strong>
                  <br />
                  {city.count} visits
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {unmappedCount > 0 && (
        <div className="absolute bottom-2 right-2 z-[1000] rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
          {unmappedCount} visits in unmapped cities
        </div>
      )}
    </div>
  );
});
