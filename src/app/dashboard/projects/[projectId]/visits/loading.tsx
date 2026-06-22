export default function VisitsLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div>
        <div className="h-8 w-40 bg-muted/50 rounded animate-pulse mb-2" />
        <div className="h-4 w-60 bg-muted/30 rounded animate-pulse" />
      </div>

      {/* Search + filters skeleton */}
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-64 bg-muted/30 rounded animate-pulse" />
        <div className="h-10 w-36 bg-muted/30 rounded animate-pulse" />
        <div className="h-10 w-36 bg-muted/30 rounded animate-pulse" />
        <div className="h-10 w-36 bg-muted/30 rounded animate-pulse" />
      </div>

      {/* Table skeleton */}
      <div className="card-premium rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="bg-muted/20 border-b border-border/50 px-4 py-3">
          <div className="grid grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-4 w-full bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        </div>
        {/* Table rows */}
        <div className="divide-y divide-border/30">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div key={i} className="px-4 py-3">
              <div className="grid grid-cols-6 gap-4">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="h-4 bg-muted/20 rounded animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Pagination skeleton */}
        <div className="border-t border-border/50 px-4 py-3 flex justify-between items-center">
          <div className="h-4 w-32 bg-muted/30 rounded animate-pulse" />
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-8 bg-muted/30 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
