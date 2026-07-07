"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SidebarItemProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  collapsed: boolean;
  onClick?: () => void;
  isForm?: boolean;
}

export function SidebarItem({
  href,
  icon: Icon,
  label,
  isActive,
  collapsed,
  onClick,
  isForm,
}: SidebarItemProps) {
  const baseClasses = cn(
    "group flex w-full items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors duration-150",
    collapsed ? "justify-center px-2" : "px-3",
    isActive
      ? "border-l-[3px] border-signal-orange bg-sidebar-active text-foreground"
      : "border-l-[3px] border-transparent text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
  );

  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  );

  if (isForm) {
    return (
      <button
        type="submit"
        onClick={onClick}
        title={collapsed ? label : undefined}
        className={baseClasses}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={baseClasses}
    >
      {content}
    </Link>
  );
}
