import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthHeroVariant } from "@/components/auth/AuthPageLayout";

interface AuthModeSwitchProps {
  variant: AuthHeroVariant;
  className?: string;
}

/** Top-right curved toggle: login page → Sign Up, signup page → Sign In. */
export function AuthModeSwitch({ variant, className }: AuthModeSwitchProps) {
  const isLogin = variant === "login";
  const to = isLogin ? "/signup" : "/login";
  const label = isLogin ? "Sign Up" : "Sign In";
  const hint = isLogin ? "New here?" : "Already registered?";

  return (
    <div className={cn("flex flex-col items-end gap-0.5", className)}>
      <span className="text-[11px] font-medium text-[hsl(24_8%_50%)] hidden sm:block">{hint}</span>
      <Link
        to={to}
        className={cn(
          "auth-mode-switch group relative inline-flex h-8 items-center gap-1.5 overflow-hidden",
          "rounded-full border border-[hsl(var(--color-primary)/0.3)] bg-white px-3.5",
          "text-xs font-semibold text-[hsl(var(--color-primary-dark))]",
          "shadow-[0_2px_12px_hsl(24_95%_53%_/_0.12)]",
          "transition-all duration-300 ease-out",
          "hover:border-[hsl(var(--color-primary))] hover:bg-[hsl(var(--color-primary))] hover:text-white",
          "hover:shadow-[0_4px_18px_hsl(24_95%_53%_/_0.28)] hover:scale-[1.03] active:scale-[0.98]"
        )}
      >
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full"
          aria-hidden
        />
        <span className="relative">{label}</span>
        <ArrowRight className="relative h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
