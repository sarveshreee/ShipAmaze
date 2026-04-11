import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

export function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className={cn(
      "fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40",
      "flex items-center gap-3 rounded-xl bg-card border border-border shadow-card-lg px-5 py-3",
      "animate-fade-in-up"
    )}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
          {count}
        </span>
        <span className="text-sm font-medium text-text-primary whitespace-nowrap">selected</span>
      </div>
      <div className="h-6 w-px bg-border" />
      <div className="flex items-center gap-2">
        {children}
      </div>
      <div className="h-6 w-px bg-border" />
      <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted hover:text-text-primary" onClick={onClear}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
