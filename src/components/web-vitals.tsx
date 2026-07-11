"use client";

import { useReportWebVitals } from "next/web-vitals";

export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[Web Vital] ${metric.name}: ${Math.round(metric.value)}ms (${metric.rating})`);
    }
  });
  return null;
}
