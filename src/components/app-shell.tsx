"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "sidebar-collapsed";

export function AppShell({
  children,
  session,
  siteTitle = "iSN",
}: {
  children: ReactNode;
  session: { user: { email?: string | null; name?: string | null; role: "PLATFORM_ADMIN" | "CLIENT_ADMIN" | "TENANT_USER" } };
  siteTitle?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    setSidebarCollapsed(stored === "true");

    const handler = () => {
      setSidebarCollapsed(localStorage.getItem(COLLAPSED_KEY) === "true");
    };
    window.addEventListener("storage", handler);
    window.addEventListener("sidebar-toggle", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("sidebar-toggle", handler);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
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

      {/* Main content area — offset by sidebar width */}
      <div
        className={cn(
          "transition-[padding] duration-200",
          sidebarCollapsed ? "md:pl-16" : "md:pl-60"
        )}
      >
        {/* Slim header — 48px, sticky */}
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 md:px-6">
          {/* Left: mobile hamburger + logo/site title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent md:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 font-space-grotesk text-sm font-medium tracking-tight text-foreground"
            >
              {siteTitle}
              <span className="text-primary text-xs leading-none">●</span>
            </Link>
          </div>

          {/* Right: theme toggle + user name */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {session.user.name || session.user.email}
            </span>
          </div>
        </header>

        {/* Page content — fixed viewport height; scrolls when content overflows it.
            Per-project dashboard pages size their own content to match this height
            exactly (see [projectId]/layout.tsx), so no scrollbar appears there. */}
        <main className="h-[calc(100dvh-48px)] overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
