---
name: ui-design-system
description: Use when building or styling UI in this dashboard — the "Ventriloc" color tokens, Space Grotesk/Inter typography, the card pattern, pill nav + glass header, purposeful animation (aurora background, animated counters), responsive breakpoints, shadcn/ui organization, and accessibility. Source: knowledge_base/05_UI_DESIGN_SYSTEM.md.
---

# UI Design System — "Ventriloc"

## Color (limited, purposeful palette)
`signal-orange #ff682c` (primary accent/CTA), `sienna-bronze` (secondary), `carbon` (headings),
`graphite` (body), `slate` (muted), `fog` (borders), `mist` (subtle bg), `chalk` (card surface),
`paper #ffffff` (primary card). Every color has one job — no arbitrary hex values.

## Typography (two fonts only)
- **Space Grotesk**: display, KPI numbers, headings. **Inter**: body, labels, descriptions.
- KPI 2.25rem tight tracking `tabular-nums`; headings 1.5–2rem; body 0.875–1rem; labels 0.75rem
  uppercase. Hierarchy via weight/size, not more fonts.

## Patterns
- **`.card-ventriloc`**: white surface, 8px radius, subtle ghost shadow, 1.5rem padding, clean
  hover. Cards are the fundamental layout unit — one pattern, everywhere.
- **Pill nav + glass header**: active = rounded pill (20px) with signal-orange accent; sticky top
  bar with backdrop blur.

## Animation (enhances, never distracts)
- Staggered card entrances, animated KPI counters, aurora drift background (3 radial gradients,
  pure CSS), smooth state transitions. Framer Motion for complex sequences.
- **Respect `prefers-reduced-motion`** (disable aurora/animations); use GPU-friendly transforms;
  avoid layout-triggering properties.

## Responsive & components
- Breakpoints: mobile 1col → tablet 2col → desktop 3col; max content 1200px. CSS Grid for layout,
  flexbox for internals, gap-based spacing (no margins).
- **shadcn/ui** (copy-paste, you own the code; Radix primitives + Tailwind). Organize:
  `components/ui` (primitives), `components/charts` (Recharts wrappers), `components/admin`,
  `app-shell.tsx`, `lazy-chart.tsx`. Separate primitives from feature composites.

## Accessibility (required)
Focusable interactive elements, focus order = visual order, visible focus, Esc closes modals,
semantic HTML + ARIA, live regions, alt text, WCAG AA contrast, color never the only indicator.

**Note:** the iSN rebrand + de-French work is roadmap (P3) — keep new UI English. **Full detail:**
`knowledge_base/05_UI_DESIGN_SYSTEM.md`.
