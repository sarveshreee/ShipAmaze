import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Input styling for auth forms. */
export const authInputClass = "auth-input focus-visible:ring-0 focus-visible:ring-offset-0";
export const authLabelClass = "auth-label";
export const authSubmitClass = "auth-submit-btn group w-full";

interface AuthFormHeaderProps {
  title: string;
  subtitle: string;
}

export function AuthFormHeader({ title, subtitle }: AuthFormHeaderProps) {
  return (
    <div className="auth-form-header mb-6 lg:mb-7">
      <h2 className="text-[1.65rem] font-bold tracking-tight text-[hsl(24_32%_12%)]">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[hsl(24_10%_42%)]">{subtitle}</p>
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
