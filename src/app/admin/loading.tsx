export default function AdminLoading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div>
        <div className="h-8 w-48 bg-muted/50 rounded animate-pulse mb-2" />
        <div className="h-4 w-72 bg-muted/30 rounded animate-pulse" />
      </div>

      {/* Tenants section */}
      <div className="card-premium rounded-xl p-6 space-y-4">
        <div className="h-5 w-32 bg-muted/50 rounded animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
              <div className="h-4 w-40 bg-muted/30 rounded animate-pulse" />
              <div className="h-4 w-24 bg-muted/20 rounded animate-pulse" />
              <div className="h-8 w-20 bg-muted/30 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Users section */}
      <div className="card-premium rounded-xl p-6 space-y-4">
        <div className="h-5 w-28 bg-muted/50 rounded animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
              <div className="h-4 w-48 bg-muted/30 rounded animate-pulse" />
              <div className="h-4 w-20 bg-muted/20 rounded animate-pulse" />
              <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Run logs section */}
      <div className="card-premium rounded-xl p-6 space-y-4">
        <div className="h-5 w-36 bg-muted/50 rounded animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
              <div className="h-4 w-32 bg-muted/30 rounded animate-pulse" />
              <div className="h-4 w-24 bg-muted/20 rounded animate-pulse" />
              <div className="h-4 w-40 bg-muted/30 rounded animate-pulse" />
              <div className="h-4 w-16 bg-muted/20 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
