import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Input styling for auth forms. */
export const authInputClass = "auth-input focus-visible:ring-0 focus-visible:ring-offset-0";
export const authLabelClass = "auth-label";
export const authSubmitClass = "auth-submit-btn group w-full";
/** Two columns on desktop to save vertical space; full width on mobile. */
export const authFieldGridClass = "grid grid-cols-1 gap-1.5 lg:grid-cols-2 lg:gap-2";

interface AuthFormHeaderProps {
  title: string;
  subtitle: string;
  compact?: boolean;
}

export function AuthFormHeader({ title, subtitle, compact }: AuthFormHeaderProps) {
  return (
    <div className={cn("auth-form-header", compact ? "mb-2" : "mb-5 sm:mb-6 lg:mb-7")}>
      <h2
        className={cn(
          "font-bold tracking-tight text-[hsl(24_32%_12%)]",
          compact ? "text-lg lg:text-[1.2rem] leading-tight" : "text-2xl sm:text-[1.65rem]",
        )}
      >
        {title}
      </h2>
      <p
        className={cn(
          "text-[hsl(24_10%_42%)]",
          compact ? "mt-0.5 text-[11px] leading-tight lg:hidden" : "mt-1.5 text-sm leading-relaxed sm:mt-2",
        )}
      >
        {subtitle}
      </p>
    </div>
  );
}

interface AuthFormFooterProps {
  children: ReactNode;
  className?: string;
}

export function AuthFormFooter({ children, className }: AuthFormFooterProps) {
  return (
    <p className={cn("auth-form-footer mt-6 text-center text-sm text-[hsl(24_10%_42%)]", className)}>
      {children}
    </p>
  );
}
