import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Tailwind-aware className combiner (shadcn convention).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// All formatters default to en-CA so dates render in English ("Apr 08")
// rather than French ("08 avr"). They never throw and return "—" for
// null/undefined/empty/invalid input so callers can pass raw values safely.

const DATE_LOCALE = "en-CA";

type DateInput = Date | string | number | null | undefined;

function toValidDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: DateInput): string {
  const d = toValidDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(DATE_LOCALE, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatDateTime(value: DateInput): string {
  const d = toValidDate(value);
  if (!d) return "—";
  return d.toLocaleString(DATE_LOCALE, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(DATE_LOCALE);
}

// Percentage of `value` out of `total`, e.g. formatPct(265, 436) -> "61%".
export function formatPct(value: number, total: number): string {
  if (!total || Number.isNaN(value) || Number.isNaN(total)) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function hexToHsl(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue = 0;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) hue = ((b - r) / d + 2) * 60;
  else hue = ((r - g) / d + 4) * 60;
  return `${Math.round(hue)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
