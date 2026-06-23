---
name: frontend-architecture
description: Use when building or reviewing Next.js frontend code in this dashboard — server vs client component choices, RSC data fetching, the provider abstraction, lazy loading, the no-state-library philosophy, server actions, file-based routing, auth middleware, strict TypeScript, Zod, and accessibility. Source: knowledge_base/04_FRONTEND_ARCHITECTURE.md.
---

# Frontend Architecture

## Server-first (the default)
- **React Server Components by default.** Fetch on the server, render to HTML, ship client JS
  only for interactive leaves. Push the server/client boundary as close to the leaves as possible.
- Mark `"use client"` only for forms, charts, animations, interactive UI.
- **Lazy-load** heavy/below-the-fold/conditional components: `dynamic(() => import('./chart'), { ssr: false })`.

## State — deliberately no Redux/Zustand
- **Server state**: fetched in RSC, passed as props. **Form state**: controlled components.
  **Session**: httpOnly cookies decoded server-side. **URL state**: routing + search params.
- **Mutations via server actions** (CSRF-safe, type-safe, can call the backend directly).

## Data fetching
- Async server components are the simplest pattern — no manual loading flags for the fetch.
- **Provider abstraction**: a TS interface with `RestApiProvider` (prod), `SampleDataProvider`
  (dev), `ShopmetricsProvider` (direct), chosen by env var. Swap without UI changes.
  Pure helpers extracted from components live in `src/lib/*.ts` (unit-tested directly).
- Suspense for loading, error boundaries for failures. **Never** silently fall back to sample
  data on a real-data error (`.claude/rules/sample-data.md`).

## Routing & auth
- File-based routing maps to URLs; organize by feature, shared UI via nested layouts.
- **Auth in middleware**, before any page renders: validate the session cookie, redirect
  unauthenticated users, enforce role-based route protection.

## Type safety & a11y
- Strict TS: no `any`, strict null checks, path alias `@/*` → `src/*`.
- **Zod** validates runtime/external data: server-action inputs, API responses, form data.
- Semantic HTML, ARIA, keyboard nav, focus management; respect `prefers-reduced-motion`.

**Full detail:** `knowledge_base/04_FRONTEND_ARCHITECTURE.md`. Perf: `.claude/skills/frontend-performance`.
