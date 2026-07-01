"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { LogOut, Settings } from "lucide-react";
import { logoutAction } from "@/app/dashboard/actions";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; adminOnly?: boolean };

export function AppShell({
  children,
  session,
  siteTitle = "iSN",
}: {
  children: ReactNode;
  session: { user: { email?: string | null; name?: string | null; role: "PLATFORM_ADMIN" | "CLIENT_ADMIN" | "TENANT_USER" } };
  siteTitle?: string;
}) {
  const pathname = usePathname();
  const projectMatch = pathname.match(/^\/dashboard\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];

  const items: NavItem[] = [
    { href: "/dashboard", label: "Home" },
  ];

  if (projectId) {
    items.push(
      { href: `/dashboard/projects/${projectId}`, label: "Project Overview" },
      { href: `/dashboard/projects/${projectId}/visits`, label: "Visit List" },
      { href: `/dashboard/projects/${projectId}/visits?view=photos`, label: "Visit Photos" },
    );
  }

  items.push({ href: "/admin", label: "Admin", adminOnly: true });

  const filtered = items.filter(
    (i) => !i.adminOnly || session.user.role === "PLATFORM_ADMIN" || session.user.role === "CLIENT_ADMIN"
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Nav ───────────────────────────────────────────── */}
      <header className="glass-header sticky top-0 z-20 h-14">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-8">

          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 font-space-grotesk text-sm font-medium tracking-tight text-carbon"
          >
            {siteTitle}
            <span className="text-signal-orange text-xs leading-none">●</span>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-0.5">
            {filtered.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href.split("?")[0]);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-pill px-4 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-chalk text-carbon"
                      : "text-graphite hover:bg-chalk/60 hover:text-carbon"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User + sign out */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate">
              {session.user.name || session.user.email}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-pill border border-chalk px-3 py-1.5 text-xs font-medium text-graphite transition-colors hover:border-carbon/30 hover:text-carbon"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ── Page content ──────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-[1200px] px-8 py-8">
        {children}
      </main>
    </div>
  );
}