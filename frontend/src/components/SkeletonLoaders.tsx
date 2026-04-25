import { Skeleton } from "@/components/ui/skeleton";

export function KPICardSkeleton() {
  return (
    <div className="rounded-lg bg-card p-5 shadow-card">
      <div className="flex items-start justify-between">
        <Skeleton className="h-10 w-10 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-8 w-24" />
      <Skeleton className="mt-2 h-4 w-32" />
    </div>
  );
}

export function TableRowSkeleton({ columns = 9 }: { columns?: number }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-3">
          <Skeleton className={`h-4 ${i === 0 ? "w-20" : i === 6 ? "w-16 rounded-full" : "w-24"}`} />
        </td>
      ))}
    </tr>
  );
}

export function TableSkeleton({ rows = 8, columns = 9 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} columns={columns} />
      ))}
    </>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg bg-card shadow-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
            <Skeleton className="h-12 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrderCardSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl bg-card border border-border p-4 space-y-3 animate-pulse">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-lg bg-card shadow-card p-5">
      <Skeleton className="h-5 w-40 mb-4" />
      <div className="flex items-end gap-2 h-[220px]">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md"
            style={{ height: `${40 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function FullPageSkeleton() {
  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KPICardSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-lg bg-card shadow-card overflow-hidden">
        <div className="p-3 border-b border-border">
          <Skeleton className="h-4 w-32" />
        </div>
        <table className="w-full">
          <tbody>
            <TableSkeleton rows={6} columns={7} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
