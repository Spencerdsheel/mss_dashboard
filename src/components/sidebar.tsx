"use client";

import { useEffect, useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { logoutAction } from "@/app/dashboard/actions";
import { SidebarItem } from "@/components/sidebar-item";
import { SidebarGroup } from "@/components/sidebar-group";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "sidebar-collapsed";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored === "true") setCollapsed(true);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    window.dispatchEvent(new Event("sidebar-toggle"));
  }, [collapsed, mounted]);

  const projectMatch = pathname.match(/^\/dashboard\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];

  const isAdmin = user.role === "PLATFORM_ADMIN" || user.role === "CLIENT_ADMIN";
  const isPlatformAdmin = user.role === "PLATFORM_ADMIN";

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  const width = collapsed ? "w-16" : "w-60";

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
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-sidebar-bg transition-all duration-200",
          width,
          "hidden md:flex",
          mobileOpen && "!flex"
        )}
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
                {user.name || user.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {user.email}
              </div>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <div className={cn("flex px-3 py-2", collapsed && "justify-center px-2")}>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-sidebar-hover hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
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
                  href={`/dashboard/projects/${projectId}/geography`}
                  icon={Globe}
                  label="Geography"
                  isActive={pathname === `/dashboard/projects/${projectId}/geography`}
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
              {isPlatformAdmin && (
                <>
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
                </>
              )}
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
      </aside>
    </>
  );
}
