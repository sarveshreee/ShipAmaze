import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  breadcrumb?: string[];
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, breadcrumb, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        {breadcrumb && (
          <div className="flex items-center gap-1 text-xs text-text-muted mt-0.5">
            {breadcrumb.map((item, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 mt-2 sm:mt-0">{actions}</div>}
    </div>
  );
}
