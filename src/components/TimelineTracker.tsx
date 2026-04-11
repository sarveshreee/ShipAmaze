import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Package, Truck, MapPin, Home, PackageCheck } from "lucide-react";

interface Step {
  label: string;
  detail?: string;
  timestamp?: string;
  icon?: React.ElementType;
}

interface TimelineTrackerProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

const defaultIcons = [Package, Truck, MapPin, Home, PackageCheck];

export function TimelineTracker({ steps, currentStep, className }: TimelineTrackerProps) {
  return (
    <div className={cn("relative", className)}>
      {steps.map((step, i) => {
        const completed = i < currentStep;
        const current = i === currentStep;
        const StepIcon = step.icon || defaultIcons[i] || Circle;
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              {completed ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success text-success-foreground shrink-0 shadow-sm">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              ) : current ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 shadow-sm animate-pulse">
                  <StepIcon className="h-4 w-4" />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border text-text-muted shrink-0">
                  <StepIcon className="h-4 w-4" />
                </div>
              )}
              {i < steps.length - 1 && (
                <div className={cn("w-0.5 flex-1 min-h-[28px] my-1 rounded-full", completed ? "bg-success" : "bg-border")} />
              )}
            </div>
            <div className="pb-5 pt-1">
              <p className={cn("text-sm font-medium leading-tight", completed ? "text-success-dark" : current ? "text-primary" : "text-text-muted")}>
                {step.label}
              </p>
              {step.detail && <p className="text-xs text-text-secondary mt-0.5">{step.detail}</p>}
              {step.timestamp && <p className="text-[11px] text-text-muted mt-0.5 font-mono">{step.timestamp}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
