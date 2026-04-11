import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

interface Step {
  label: string;
  detail?: string;
  timestamp?: string;
}

interface TimelineTrackerProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export function TimelineTracker({ steps, currentStep, className }: TimelineTrackerProps) {
  return (
    <div className={cn("relative", className)}>
      {steps.map((step, i) => {
        const completed = i < currentStep;
        const current = i === currentStep;
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              {completed ? (
                <CheckCircle2 className="h-6 w-6 text-success shrink-0" />
              ) : current ? (
                <Loader2 className="h-6 w-6 text-primary animate-spin shrink-0" />
              ) : (
                <Circle className="h-6 w-6 text-text-muted shrink-0" />
              )}
              {i < steps.length - 1 && (
                <div className={cn("w-0.5 flex-1 min-h-[32px]", completed ? "bg-success" : "bg-border")} />
              )}
            </div>
            <div className="pb-6">
              <p className={cn("text-sm font-medium", completed ? "text-success-dark" : current ? "text-primary" : "text-text-muted")}>
                {step.label}
              </p>
              {step.detail && <p className="text-xs text-text-secondary">{step.detail}</p>}
              {step.timestamp && <p className="text-xs text-text-muted">{step.timestamp}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
