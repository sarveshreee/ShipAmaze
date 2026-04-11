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
