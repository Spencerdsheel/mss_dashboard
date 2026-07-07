"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface PillNavItem {
  label: string;
  href: string;
  exact?: boolean;
}

export function PillNav({ items }: { items: PillNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm border-b-2 border-[#ff682c]"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
