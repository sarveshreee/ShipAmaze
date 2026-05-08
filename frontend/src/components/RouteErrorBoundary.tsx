import React, { type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type State = { hasError: boolean; message?: string };

export class RouteErrorBoundary extends React.Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: undefined };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("[RouteErrorBoundary]", err, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.message || "An unexpected error occurred. You can try reloading the page."}
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
