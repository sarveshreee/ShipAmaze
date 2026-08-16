import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { clearImpersonationReturnPath } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

/** Persistent bar shown while an admin is impersonating another user. */
export function ImpersonationBanner() {
  const { isImpersonating, user, stopImpersonation, getImpersonationReturnPath } = useAuth();
  const navigate = useNavigate();
  const [returning, setReturning] = useState(false);

  if (!isImpersonating || !user) return null;

  const displayName = user.name?.trim() || user.email || "user";

  const handleReturn = async () => {
    setReturning(true);
    try {
      const returnPath = getImpersonationReturnPath();
      const adminUser = await stopImpersonation();
      if (!adminUser) {
        toast.error("Could not restore admin session. Please log in again.");
        clearImpersonationReturnPath();
        navigate("/login", { replace: true });
        return;
      }
      toast.success("Returned to admin session");
      const target =
        returnPath && returnPath.startsWith("/admin") ? returnPath : "/admin/users";
      clearImpersonationReturnPath();
      navigate(target, { replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to return to admin");
    } finally {
      setReturning(false);
    }
  };

  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-950 dark:text-amber-100"
    >
      <div className="flex min-w-0 items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <p className="min-w-0 truncate font-medium">
          You are impersonating <span className="font-semibold">{displayName}</span>
          {user.email ? (
            <span className="font-normal text-amber-900/80 dark:text-amber-100/80"> ({user.email})</span>
          ) : null}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 shrink-0 border-amber-600/50 bg-background/80 text-amber-950 hover:bg-amber-500/20 dark:text-amber-50"
        disabled={returning}
        onClick={() => void handleReturn()}
      >
        {returning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Return to Admin
      </Button>
    </div>
  );
}
