"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  PaginationState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Image as ImageIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { rowsExcluding as cascadeRows, cascadingOptions } from "@/lib/cascading-filters";

// P1.4: Success values now come from campaign config in DB, not hardcoded constants.
// The table shows raw install values without success highlighting.

export type VisitRow = {
  id: string;
  surveyId: string;
  storeId: string;
  storeName: string;
  city: string | null;
  address: string | null;
  visitDate: string;
  clerkName: string | null;
  install1: string | null;
  install2: string | null;
  install3: string | null;
  photoCount: number;
};

type Props = {
  projectId: string;
  rows: VisitRow[];
  cities: string[];
  install1Values: string[];
  install2Values: string[];
  install3Values: string[];
};

function statusBadge(value: string | null) {
  if (!value) return <span className="text-slate">—</span>;
  // P1.4: Success semantics now come from campaign config in DB.
  // Simple heuristic: "Not targeted" / "Store closed" / "Refused" are neutral/negative.
  const isNegative = value.toLowerCase().includes("refused") || value.toLowerCase().includes("closed");
  const isNeutral = value.toLowerCase().includes("not targeted");
  return (
    <span
      className={cn(
        "inline-flex max-w-[200px] items-center truncate rounded-full px-2.5 py-0.5 text-xs font-medium",
        isNegative
          ? "bg-red-50 text-red-600"
          : isNeutral
          ? "bg-chalk text-slate"
          : "bg-[#ff682c]/10 text-[#ff682c]"
      )}
    >
      {value}
    </span>
  );
}

export function VisitsTable({
  projectId,
  rows,
}: Props) {
  const router = useRouter();
  const [globalSearch, setGlobalSearch] = useState("");
  const deferredSearch = useDeferredValue(globalSearch);
  const [sorting, setSorting] = useState<SortingState>([{ id: "visitDate", desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [city, setCity] = useState<string>("__all__");
  const [i1, setI1] = useState<string>("__all__");
  const [i2, setI2] = useState<string>("__all__");
  const [i3, setI3] = useState<string>("__all__");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  // Cascading option lists: each dimension's options come from rows filtered by
  // all OTHER active selections. The currently-selected value is always included
  // so the user can always deselect even if other filters would exclude it.
  // Logic lives in @/lib/cascading-filters so it can be unit-tested.
  const filters = { city, i1, i2, i3 };
  const cascadingCities = useMemo(
    () => cascadingOptions(cascadeRows(rows, filters, "city"), "city", city),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, city, i1, i2, i3]
  );
  const cascadingI1 = useMemo(
    () => cascadingOptions(cascadeRows(rows, filters, "i1"), "install1", i1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, city, i1, i2, i3]
  );
  const cascadingI2 = useMemo(
    () => cascadingOptions(cascadeRows(rows, filters, "i2"), "install2", i2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, city, i1, i2, i3]
  );
  const cascadingI3 = useMemo(
    () => cascadingOptions(cascadeRows(rows, filters, "i3"), "install3", i3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, city, i1, i2, i3]
  );

  const columns = useMemo<ColumnDef<VisitRow>[]>(
    () => [
      {
        accessorKey: "visitDate",
        header: ({ column }) => <SortButton column={column} label="Date" />,
        cell: ({ row }) => (
          <span className="tabular-nums text-graphite">{formatDate(row.original.visitDate)}</span>
        ),
        sortingFn: "datetime",
      },
      {
        accessorKey: "storeName",
        header: ({ column }) => <SortButton column={column} label="Store" />,
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-carbon">{row.original.storeName}</div>
            <div className="text-xs text-slate">
              {row.original.storeId}
              {row.original.address ? ` · ${row.original.address}` : ""}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "city",
        header: ({ column }) => <SortButton column={column} label="City" />,
        cell: ({ row }) => (
          <span className="text-graphite">{row.original.city || "—"}</span>
        ),
        filterFn: "equals",
      },
      {
        accessorKey: "install1",
        header: "Install 1",
        cell: ({ row }) => statusBadge(row.original.install1),
        filterFn: "equals",
      },
      {
        accessorKey: "install2",
        header: "Install 2",
        cell: ({ row }) => statusBadge(row.original.install2),
        filterFn: "equals",
      },
      {
        accessorKey: "install3",
        header: "Install 3",
        cell: ({ row }) => statusBadge(row.original.install3),
        filterFn: "equals",
      },
      {
        accessorKey: "photoCount",
        header: ({ column }) => <SortButton column={column} label="Photos" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-sm text-graphite">
            <ImageIcon className="h-3.5 w-3.5 text-slate" />
            <span className="tabular-nums">{row.original.photoCount}</span>
          </div>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters, globalFilter: deferredSearch, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalSearch,
    onPaginationChange: setPagination,
    globalFilterFn: (row, _col, value) => {
      const v = String(value).toLowerCase();
      if (!v) return true;
      const r = row.original;
      return (
        r.storeName.toLowerCase().includes(v) ||
        r.storeId.toLowerCase().includes(v) ||
        (r.city ?? "").toLowerCase().includes(v) ||
        r.surveyId.includes(v) ||
        (r.address ?? "").toLowerCase().includes(v)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  function applyFilter(id: string, value: string) {
    const next =
      value === "__all__"
        ? table.getState().columnFilters.filter((f) => f.id !== id)
        : [
            ...table.getState().columnFilters.filter((f) => f.id !== id),
            { id, value },
          ];
    setColumnFilters(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
          <Input
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search by store, city, survey ID…"
            className="rounded-lg border-chalk pl-9 text-sm placeholder:text-slate focus:ring-signal-orange"
          />
          {globalSearch !== deferredSearch && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate">
              Filtering…
            </span>
          )}
        </div>

        <FilterSelect label="City" value={city} options={cascadingCities} onChange={(v) => { setCity(v); applyFilter("city", v); }} />
        <FilterSelect label="Standee Messi" value={i1} options={cascadingI1} onChange={(v) => { setI1(v); applyFilter("install1", v); }} />
        <FilterSelect label="Flying Fish" value={i2} options={cascadingI2} onChange={(v) => { setI2(v); applyFilter("install2", v); }} />
        <FilterSelect label="Stock" value={i3} options={cascadingI3} onChange={(v) => { setI3(v); applyFilter("install3", v); }} />

        <Button
          variant="ghost"
          size="sm"
          className="rounded-pill text-slate hover:text-carbon"
          onClick={() => {
            setGlobalSearch("");
            setCity("__all__");
            setI1("__all__");
            setI2("__all__");
            setI3("__all__");
            setColumnFilters([]);
            setPagination({ pageIndex: 0, pageSize: 25 });
          }}
        >
          Reset
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-chalk bg-paper">
        <table className="w-full text-sm">
          <thead className="border-b border-chalk bg-fog">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium text-slate"
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
                <td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-slate">
                  No visits match the current filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() =>
                    router.push(
                      `/dashboard/projects/${projectId}/visits/${row.original.surveyId}`
                    )
                  }
                  className="cursor-pointer border-t border-chalk transition-colors hover:bg-fog"
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
      <div className="flex items-center justify-between text-xs text-slate">
        <div>
          {table.getFilteredRowModel().rows.length} of {rows.length} visits
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums text-graphite">
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortButton({ column, label }: { column: any; label: string }) {
  return (
    <button
      className="inline-flex items-center gap-1 text-xs font-medium text-slate hover:text-carbon"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
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
      <SelectTrigger className="w-[160px] rounded-full border-chalk text-xs text-graphite">
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
