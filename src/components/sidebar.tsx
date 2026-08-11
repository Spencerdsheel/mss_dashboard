"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  BarChart3,
  List,
  Image as ImageIcon,
  Globe,
  Shield,
  Users,
  FolderKanban,
  Camera,
  Target,
  Building2,
  Plug,
  History,
  Settings,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/app/dashboard/actions";
import { SidebarItem } from "@/components/sidebar-item";
import { SidebarGroup } from "@/components/sidebar-group";
import { cn, deriveUsername } from "@/lib/utils";

const COLLAPSED_KEY = "sidebar-collapsed";
// Sprint 16 §4.1: separate from COLLAPSED_KEY on purpose — width and
// collapse state are independent (a user can resize while expanded, then
// still collapse to the fixed 64px rail without losing their chosen width).
const WIDTH_KEY = "sidebar-width";
const COLLAPSED_WIDTH = 64;
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 180;
const MAX_WIDTH = 400;

export interface SidebarProps {
  user: {
    email: string;
    name: string;
    role: "PLATFORM_ADMIN" | "CLIENT_ADMIN" | "TENANT_USER";
  };
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ user, mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [mounted, setMounted] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const storedCollapsed = localStorage.getItem(COLLAPSED_KEY);
    if (storedCollapsed === "true") setCollapsed(true);
    const storedWidth = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(storedWidth) && storedWidth >= MIN_WIDTH && storedWidth <= MAX_WIDTH) {
      setSidebarWidth(storedWidth);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    window.dispatchEvent(new Event("sidebar-toggle"));
  }, [collapsed, mounted]);

  useEffect(() => {
    // Sprint 16 §4.1: the header's collapse button (app-shell.tsx) toggles
    // COLLAPSED_KEY directly and broadcasts "sidebar-toggle" — mirror that
    // state back into this component so both stay in sync regardless of
    // which side triggered the change.
    const handler = () => {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "true");
    };
    window.addEventListener("sidebar-toggle", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("sidebar-toggle", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const handleResizeStart = (e: React.MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    setResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const next = drag.startWidth + (moveEvent.clientX - drag.startX);
      const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next));
      setSidebarWidth(clamped);
      window.dispatchEvent(new Event("sidebar-resize"));
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      setResizing(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setSidebarWidth((current) => {
        localStorage.setItem(WIDTH_KEY, String(current));
        window.dispatchEvent(new Event("sidebar-resize"));
        return current;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const projectMatch = pathname.match(/^\/dashboard\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];

  const isAdmin = user.role === "PLATFORM_ADMIN" || user.role === "CLIENT_ADMIN";

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  const displayUsername = deriveUsername(user.email || user.name || "");

  const currentWidth = collapsed ? COLLAPSED_WIDTH : sidebarWidth;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-sidebar-bg",
          !resizing && "transition-[width] duration-200",
          "hidden md:flex",
          mobileOpen && "!flex"
        )}
        style={{ width: currentWidth }}
      >
        {/* User profile section */}
        <div
          className={cn(
            "flex items-center gap-3 border-b border-border px-3 py-4",
            collapsed && "justify-center px-2"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
            {initial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {displayUsername}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {user.email}
              </div>
            </div>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          <SidebarItem
            href="/dashboard"
            icon={LayoutDashboard}
            label="Dashboard"
            isActive={pathname === "/dashboard"}
            collapsed={collapsed}
          />

          <SidebarGroup
            icon={FolderOpen}
            label="Projects"
            collapsed={collapsed}
            defaultOpen={!!projectId}
          >
            {projectId ? (
              <>
                <SidebarItem
                  href={`/dashboard/projects/${projectId}`}
                  icon={BarChart3}
                  label="Overview"
                  isActive={pathname === `/dashboard/projects/${projectId}`}
                  collapsed={collapsed}
                />
                <SidebarItem
                  href={`/dashboard/projects/${projectId}/locations`}
                  icon={Globe}
                  label="Locations"
                  isActive={pathname === `/dashboard/projects/${projectId}/locations`}
                  collapsed={collapsed}
                />
                <SidebarItem
                  href={`/dashboard/projects/${projectId}/visits`}
                  icon={List}
                  label="Visit List"
                  isActive={pathname === `/dashboard/projects/${projectId}/visits`}
                  collapsed={collapsed}
                />
                <SidebarItem
                  href={`/dashboard/projects/${projectId}/visits`}
                  icon={ImageIcon}
                  label="Visit Details"
                  isActive={pathname.startsWith(
                    `/dashboard/projects/${projectId}/visits/`
                  )}
                  collapsed={collapsed}
                />
              </>
            ) : (
              <SidebarItem
                href="/dashboard"
                icon={BarChart3}
                label="All Projects"
                isActive={pathname === "/dashboard"}
                collapsed={collapsed}
              />
            )}
          </SidebarGroup>

          {isAdmin && (
            <SidebarGroup icon={Shield} label="Admin" collapsed={collapsed}>
              <SidebarItem
                href="/admin/users"
                icon={Users}
                label="Manage Users"
                isActive={pathname.startsWith("/admin/users")}
                collapsed={collapsed}
              />
              <SidebarItem
                href="/admin/projects"
                icon={FolderKanban}
                label="Projects"
                isActive={pathname.startsWith("/admin/projects")}
                collapsed={collapsed}
              />
              <SidebarItem
                href="/admin/photo-slots"
                icon={Camera}
                label="Photo Slots"
                isActive={pathname.startsWith("/admin/photo-slots")}
                collapsed={collapsed}
              />
              <SidebarItem
                href="/admin/metrics"
                icon={Target}
                label="Metric Targets"
                isActive={pathname.startsWith("/admin/metrics")}
                collapsed={collapsed}
              />
              <SidebarItem
                href="/admin/companies"
                icon={Building2}
                label="Companies"
                isActive={pathname.startsWith("/admin/companies")}
                collapsed={collapsed}
              />
              <SidebarItem
                href="/admin/connections"
                icon={Plug}
                label="Connections"
                isActive={pathname.startsWith("/admin/connections")}
                collapsed={collapsed}
              />
              <SidebarItem
                href="/admin/runs"
                icon={History}
                label="Run History"
                isActive={pathname.startsWith("/admin/runs")}
                collapsed={collapsed}
              />
            </SidebarGroup>
          )}
        </nav>

        {/* Bottom section */}
        <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
          <SidebarItem
            href="/admin/settings"
            icon={Settings}
            label="Settings"
            isActive={pathname.startsWith("/settings") || pathname.startsWith("/admin/settings")}
            collapsed={collapsed}
          />
          <form action={logoutAction}>
            <SidebarItem
              href="#"
              icon={LogOut}
              label="Logout"
              isActive={false}
              collapsed={collapsed}
              isForm
            />
          </form>
        </div>

        {/* Sprint 16 §4.1: drag-to-resize handle on the sidebar's right edge.
            Hidden while collapsed — the collapsed rail is a fixed 64px, not
            resizable. */}
        {!collapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize sidebar"
            onMouseDown={handleResizeStart}
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none hover:bg-primary/40 active:bg-primary/60"
          />
        )}
      </aside>
    </>
  );
}
