---
name: frontend-performance
description: Use when a dashboard view is slow or being built for scale — virtualization, lazy loading, SVG/Canvas/WebGL chart choice, state scoping + memoization + React concurrency, data caching/pagination/batching, Web Workers, server-side aggregation, code-splitting, asset optimization, and perceived-performance tactics. Source: knowledge_base/frontend_optimization_guide.md.
---

# Frontend Performance

Core principle: **render less, render smarter, render only when necessary, optimize data not just
UI, measure everything.** Profile before optimizing (React DevTools Profiler, Chrome Performance,
Lighthouse).

## Rendering
- **Virtualize** long lists/tables (`react-window`, `react-virtuoso`, AG-Grid) — render ~20 rows,
  not 50k.
- **Lazy-load** below-the-fold/heavy widgets (`next/dynamic` `{ ssr: false }`, `IntersectionObserver`).
- **Chart tech by data volume:** SVG <500 pts (Recharts/shadcn — current stack), Canvas for
  thousands, WebGL for extreme. **Cap chart data to prevent DOM explosion** (the SVG-freeze lesson).
- Incremental updates (update one card, append one series point) + skeleton screens for perceived speed.

## State & re-render
- **Scope state to the nearest common ancestor** — minimize blast radius; don't put fast-changing
  filters in a root store.
- Memoize where profiling shows gains (`React.memo`, `useMemo`, `useCallback`); skip `useMemo` for
  cheap ops. React 18 concurrency: `useTransition` (you update state), `useDeferredValue` (value
  from props). React Compiler (stable) can auto-memoize if components are pure.

## Data
- Cache + dedupe (TanStack Query / SWR; stale-while-revalidate). Paginate/infinite-scroll; return
  only required fields; debounce inputs; prefetch on hover.
- Heavy filtering/aggregation → **Web Workers**; better yet, **aggregate server-side** (GROUP BY,
  downsample) — this matches our backend cache-aside + summary endpoints.

## Bundle & assets
Route + component code-splitting; tree-shake/selective imports; WebP + lazy images; subset/preload
fonts + `font-display: swap`; Brotli; analyze with bundle visualizer.

## Perceived performance
A fast-*feeling* app beats a technically-fast one: skeletons, instant feedback, flat design, keep
transitions ~250ms, optimistic UI. Respect `prefers-reduced-motion`.

**Full detail (libraries, code, case studies, checklist):** `knowledge_base/frontend_optimization_guide.md`.
