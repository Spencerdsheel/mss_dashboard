export default function ProjectLoading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div>
        <div className="h-8 w-64 bg-muted/50 rounded animate-pulse mb-2" />
        <div className="h-4 w-80 bg-muted/30 rounded animate-pulse" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card-premium rounded-xl p-6 space-y-3">
            {/* Icon + label */}
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-muted/40 rounded animate-pulse" />
              <div className="h-3 w-20 bg-muted/30 rounded animate-pulse uppercase text-xs" />
            </div>
            {/* Value */}
            <div className="h-8 w-24 bg-muted/50 rounded animate-pulse kpi-number" />
            {/* Subtext */}
            <div className="h-3 w-32 bg-muted/20 rounded animate-pulse" />
            {/* Progress bar */}
            <div className="h-2 w-full bg-muted/20 rounded-full overflow-hidden">
              <div className="h-full w-2/3 bg-muted/30 rounded-full animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card-premium rounded-xl p-6 space-y-4">
            {/* Chart title */}
            <div className="h-5 w-40 bg-muted/50 rounded animate-pulse" />
            <div className="h-4 w-56 bg-muted/30 rounded animate-pulse" />
            {/* Chart area */}
            <div className="h-64 w-full bg-muted/20 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>

      {/* Metrics table skeleton */}
      <div className="card-premium rounded-xl p-6 space-y-4">
        <div className="h-5 w-48 bg-muted/50 rounded animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="h-4 w-40 bg-muted/30 rounded animate-pulse" />
              <div className="h-4 w-20 bg-muted/40 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
