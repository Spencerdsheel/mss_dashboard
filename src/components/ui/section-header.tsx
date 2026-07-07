export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mt-10 mb-4 flex items-center gap-3">
      <div className="h-2 w-2 rounded-none bg-[#ff682c]" />
      <span
        className="font-space-grotesk text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
      >
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
