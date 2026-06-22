export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div>
        <div className="h-8 w-48 bg-muted/50 rounded animate-pulse mb-2" />
        <div className="h-4 w-72 bg-muted/30 rounded animate-pulse" />
      </div>

      {/* Project grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card-premium rounded-xl p-6 space-y-4">
            {/* Project name */}
            <div className="h-5 w-3/4 bg-muted/50 rounded animate-pulse" />
            {/* Client name */}
            <div className="h-4 w-1/2 bg-muted/30 rounded animate-pulse" />
            {/* Divider */}
            <div className="border-t border-border/50" />
            {/* Stats */}
            <div className="space-y-2">
              <div className="h-4 w-full bg-muted/30 rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-muted/30 rounded animate-pulse" />
            </div>
            {/* Date range */}
            <div className="h-3 w-1/2 bg-muted/20 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
