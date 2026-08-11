"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { hexToHsl } from "@/lib/utils";
import { breadcrumbLabelFor } from "@/lib/breadcrumb";

const COLLAPSED_KEY = "sidebar-collapsed";
const WIDTH_KEY = "sidebar-width";
const COLLAPSED_WIDTH = 64;
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 400;

export function AppShell({
  children,
  session,
  siteTitle = "iSN",
  logoText = "iSN",
  footerText = "iSN Dashboard",
  brandColor,
}: {
  children: ReactNode;
  session: {
    user: {
      email?: string | null;
      name?: string | null;
      companyName?: string | null;
      role: "PLATFORM_ADMIN" | "CLIENT_ADMIN" | "TENANT_USER";
    };
  };
  siteTitle?: string;
  logoText?: string;
  footerText?: string;
  brandColor?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    const readState = () => {
      setSidebarCollapsed(localStorage.getItem(COLLAPSED_KEY) === "true");
      const storedWidth = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(storedWidth) && storedWidth >= MIN_WIDTH && storedWidth <= MAX_WIDTH) {
        setSidebarWidth(storedWidth);
      }
    };
    readState();

    // Sprint 16 §4.1: the content area's left padding must track the
    // sidebar's *live* dragged width, not just its collapsed/expanded state
    // — sidebar.tsx broadcasts "sidebar-resize" on every drag tick (and once
    // more on mouseup, after persisting to localStorage) in addition to the
    // pre-existing "sidebar-toggle" event for collapse changes.
    window.addEventListener("storage", readState);
    window.addEventListener("sidebar-toggle", readState);
    window.addEventListener("sidebar-resize", readState);
    return () => {
      window.removeEventListener("storage", readState);
      window.removeEventListener("sidebar-toggle", readState);
      window.removeEventListener("sidebar-resize", readState);
    };
  }, []);

  const toggleCollapsed = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
    window.dispatchEvent(new Event("sidebar-toggle"));
  };

  const brandOverride =
    brandColor && brandColor !== "#ff682c"
      ? `:root { --brand: ${hexToHsl(brandColor)}; --primary: ${hexToHsl(brandColor)}; } .dark { --brand: ${hexToHsl(brandColor)}; --primary: ${hexToHsl(brandColor)}; }`
      : null;

  // Sprint 16 §4.3: PLATFORM_ADMIN sessions may span multiple tenants with no
  // single resolvable company — show a static fallback label instead of a
  // company name in that case. Otherwise prefer companyName, falling back to
  // name/email only as a display-degradation (never blank).
  const rightLabel =
    session.user.role === "PLATFORM_ADMIN" && !session.user.companyName
      ? "iSN Admin"
      : session.user.companyName ?? session.user.name ?? session.user.email ?? "";

  const breadcrumbLabel = breadcrumbLabelFor(pathname ?? "");

  // Sprint 16 §4.1: the sidebar is `hidden md:flex` (mobile uses the
  // hamburger + slide-over instead), so the content area's left offset only
  // applies at the md breakpoint. Below md, padding must stay 0 — expressed
  // here as an inline style (not a Tailwind class) because the desktop value
  // now varies continuously with the dragged width, not just two fixed
  // Tailwind breakpoints. `md:!pl-[var(--shell-pl)]` keeps the mobile value
  // untouched while letting the CSS variable drive the desktop offset.
  const desktopPaddingLeft = sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  return (
    <div
      className="min-h-screen bg-background"
      style={{ ["--shell-pl" as string]: `${desktopPaddingLeft}px` }}
    >
      {brandOverride && (
        <style dangerouslySetInnerHTML={{ __html: brandOverride }} />
      )}

      {/* Sidebar */}
      <Sidebar
        user={{
          email: session.user.email ?? "",
          name: session.user.name ?? "",
          role: session.user.role,
        }}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content area — offset by the sidebar's live (possibly dragged)
          width via the --shell-pl CSS variable set above, applied only at
          the md breakpoint (mobile has no persistent sidebar offset). */}
      <div className="transition-[padding] duration-200 md:pl-[var(--shell-pl)]">
        {/* Slim header — 48px, sticky */}
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 md:px-6">
          {/* Left: mobile hamburger, (desktop) collapse toggle + breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent md:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Sprint 16 §4.1: collapse toggle relocated here from inside the
                sidebar itself. */}
            <button
              type="button"
              onClick={toggleCollapsed}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>

            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 font-space-grotesk text-sm font-medium tracking-tight text-foreground shrink-0"
            >
              {siteTitle}
              <span className="text-primary text-xs leading-none">●</span>
            </Link>

            {/* Sprint 16 §4.4: two-level breadcrumb, plain text (not interactive nav). */}
            <span className="hidden sm:inline truncate text-xs text-muted-foreground">
              Dashboard <span className="mx-1 text-muted-foreground/50">/</span> {breadcrumbLabel}
            </span>
          </div>

          {/* Right: theme toggle + company name (email removed per §4.3) */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {rightLabel}
            </span>
          </div>
        </header>

        <main className="h-[calc(100dvh-48px)] overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
