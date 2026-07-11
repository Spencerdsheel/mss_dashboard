"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Search,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, cn } from "@/lib/utils";
import type { VisitFilters } from "@/server/providers/rest-api-provider";

// P1.4: Success values now come from campaign config in DB, not hardcoded constants.
// The table shows raw install values without success highlighting.

export type VisitItem = {
  instance_id: string;
  store_id: string;
  store_name: string;
  visit_date: string;
  city: string | null;
  address: string | null;
  clerk_name: string | null;
  install1: string | null;
  install2: string | null;
  install3: string | null;
  overall_notes: string | null;
  photo_count: number;
};

type FilterOptions = {
  cities: string[];
  install1_values: string[];
  install2_values: string[];
  install3_values: string[];
};

type Props = {
  projectId: string;
  items: VisitItem[];
  totalCount: number;
  nextCursor: string | null;
  prevCursor: string | null;
  filterOptions: FilterOptions;
  currentSort: string;
  currentDir: string;
  currentSearch: string;
  currentFilters: VisitFilters;
  currentLimit: number;
};

function statusBadge(value: string | null) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  // P1.4: Success semantics now come from campaign config in DB.
  // Simple heuristic: "Not targeted" / "Store closed" / "Refused" are neutral/negative.
  const isNegative = value.toLowerCase().includes("refused") || value.toLowerCase().includes("closed");
  const isNeutral = value.toLowerCase().includes("not targeted");
  return (
    <span
      className={cn(
        "inline-flex max-w-[200px] items-center truncate rounded-full px-2.5 py-0.5 text-xs font-medium",
        isNegative
          ? "bg-danger/10 text-danger"
          : isNeutral
          ? "bg-muted text-muted-foreground"
          : "bg-primary/10 text-primary"
      )}
    >
      {value}
    </span>
  );
}

export function VisitsTable({
  projectId,
  items,
  totalCount,
  nextCursor,
  prevCursor,
  filterOptions,
  currentSort,
  currentDir,
  currentSearch,
  currentFilters,
  currentLimit,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(currentSearch);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchInput(currentSearch);
  }, [currentSearch]);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>, opts: { resetCursor?: boolean } = {}) => {
      const { resetCursor = true } = opts;
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "" || value === "__all__") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      if (resetCursor && !("cursor" in updates)) {
        params.delete("cursor");
      }
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (searchInput === currentSearch) return;
    searchTimeout.current = setTimeout(() => {
      updateParams({ search: searchInput || undefined });
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleSort = useCallback(
    (sortKey: string) => {
      const nextDir = currentSort === sortKey && currentDir === "desc" ? "asc" : "desc";
      updateParams({ sort: sortKey, dir: nextDir });
    },
    [currentSort, currentDir, updateParams]
  );

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      updateParams({ [key]: value === "__all__" ? undefined : value });
    },
    [updateParams]
  );

  const handleNextPage = useCallback(() => {
    if (!nextCursor) return;
    updateParams({ cursor: nextCursor }, { resetCursor: false });
  }, [nextCursor, updateParams]);

  const handlePrevPage = useCallback(() => {
    if (!prevCursor) return;
    updateParams({ cursor: prevCursor }, { resetCursor: false });
  }, [prevCursor, updateParams]);

  const handleLimitChange = useCallback(
    (value: string) => {
      updateParams({ limit: value });
    },
    [updateParams]
  );

  const handleReset = useCallback(() => {
    startTransition(() => {
      router.push(pathname);
    });
    setSearchInput("");
  }, [pathname, router]);

  const columns: ColumnDef<VisitItem>[] = [
    {
      id: "visit_date",
      accessorKey: "visit_date",
      header: () => <SortHeader sortKey="visit_date" label="Date" currentSort={currentSort} currentDir={currentDir} onSort={handleSort} />,
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">{formatDate(row.original.visit_date)}</span>
      ),
    },
    {
      id: "store_name",
      accessorKey: "store_name",
      header: "Store",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-foreground">{row.original.store_name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.store_id}
            {row.original.address ? ` · ${row.original.address}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "city",
      accessorKey: "city",
      header: "City",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.city || "—"}</span>,
    },
    {
      id: "install1",
      accessorKey: "install1",
      header: "Install 1",
      cell: ({ row }) => statusBadge(row.original.install1),
    },
    {
      id: "install2",
      accessorKey: "install2",
      header: "Install 2",
      cell: ({ row }) => statusBadge(row.original.install2),
    },
    {
      id: "install3",
      accessorKey: "install3",
      header: "Install 3",
      cell: ({ row }) => statusBadge(row.original.install3),
    },
    {
      id: "photo_count",
      accessorKey: "photo_count",
      header: "Photos",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums">{row.original.photo_count}</span>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by store name…"
            className="rounded-lg border-border pl-9 text-sm placeholder:text-muted-foreground focus:ring-primary"
          />
        </div>

        <FilterSelect
          label="City"
          value={currentFilters.city ?? "__all__"}
          options={filterOptions.cities}
          onChange={(v) => handleFilterChange("city", v)}
        />
        <FilterSelect
          label="Install 1"
          value={currentFilters.install1 ?? "__all__"}
          options={filterOptions.install1_values}
          onChange={(v) => handleFilterChange("install1", v)}
        />
        <FilterSelect
          label="Install 2"
          value={currentFilters.install2 ?? "__all__"}
          options={filterOptions.install2_values}
          onChange={(v) => handleFilterChange("install2", v)}
        />
        <FilterSelect
          label="Install 3"
          value={currentFilters.install3 ?? "__all__"}
          options={filterOptions.install3_values}
          onChange={(v) => handleFilterChange("install3", v)}
        />

        <Button
          variant="ghost"
          size="sm"
          className="rounded-pill text-muted-foreground hover:text-foreground"
          onClick={handleReset}
        >
          Reset
        </Button>
      </div>

      {/* Table */}
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-card",
          isPending && "opacity-50 pointer-events-none transition-opacity"
        )}
      >
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  No visits match the current filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() =>
                    router.push(
                      `/dashboard/projects/${projectId}/visits/${row.original.instance_id}`
                    )
                  }
                  className="cursor-pointer border-t border-border transition-colors hover:bg-muted"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>
            {totalCount.toLocaleString()} visit{totalCount === 1 ? "" : "s"}
          </span>
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Select value={String(currentLimit)} onValueChange={handleLimitChange}>
            <SelectTrigger className="w-[100px] rounded-full border-border text-xs text-muted-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
              <SelectItem value="100">100 / page</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={!prevCursor || isPending}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={!nextCursor || isPending}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  sortKey,
  label,
  currentSort,
  currentDir,
  onSort,
}: {
  sortKey: string;
  label: string;
  currentSort: string;
  currentDir: string;
  onSort: (key: string) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {isActive ? (
        currentDir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : null}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px] rounded-full border-border text-xs text-muted-foreground">
        <SelectValue placeholder={label}>
          {value === "__all__" ? label : value.length > 20 ? value.slice(0, 20) + "…" : value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{label} — all</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
