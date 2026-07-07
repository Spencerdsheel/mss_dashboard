"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarGroupProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function SidebarGroup({
  icon: Icon,
  label,
  collapsed,
  defaultOpen = false,
  children,
}: SidebarGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popoverOpen]);

  if (collapsed) {
    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          title={label}
          onClick={() => setPopoverOpen((v) => !v)}
          className={cn(
            "flex w-full items-center justify-center rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-sidebar-hover hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
        </button>
        {popoverOpen && (
          <div className="absolute left-full top-0 z-30 ml-2 w-56 rounded-md border border-border bg-sidebar-bg p-2 shadow-lg">
            <div className="mb-1 px-2 text-xs font-semibold text-muted-foreground">
              {label}
            </div>
            <div className="flex flex-col gap-1">{children}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-sidebar-hover hover:text-foreground"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-border pl-2">
          {children}
        </div>
      )}
    </div>
  );
}
