"use client";

import { useEffect, useRef, useState } from "react";

function ChartSkeleton() {
  return (
    <div className="h-full w-full min-h-[120px] rounded-lg bg-muted/20 animate-pulse" />
  );
}

export function LazyChart({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-full w-full min-h-0">
      {visible ? children : <ChartSkeleton />}
    </div>
  );
}
