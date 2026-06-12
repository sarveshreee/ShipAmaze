import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";

export function AccessDenied({ message }: { message?: string }) {
  const { isStaffAdmin, can } = useStaffPermissions();

  const fallback =
    isStaffAdmin && can.ordersView
      ? "/admin/orders"
      : isStaffAdmin && can.productsView
        ? "/admin/products"
        : isStaffAdmin && can.analyticsView
          ? "/admin/analytics"
          : "/admin/profile";

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center animate-fade-in-up">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
        <ShieldOff className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-semibold text-text-primary">Access denied</h2>
      <p className="mt-2 max-w-md text-sm text-text-muted">
        {message ?? "You do not have permission to view this page. Contact your administrator if you need access."}
      </p>
      <Button asChild className="mt-6" variant="outline">
        <Link to={fallback}>Go back</Link>
      </Button>
    </div>
  );
}
