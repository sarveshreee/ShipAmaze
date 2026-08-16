import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface PartnerApiKeyCreatedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string | null;
  keyPrefix: string | null;
  warning?: string;
}

export function PartnerApiKeyCreatedDialog({
  open,
  onOpenChange,
  apiKey,
  keyPrefix,
  warning,
}: PartnerApiKeyCreatedDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleClose = (next: boolean) => {
    if (!next) setCopied(false);
    onOpenChange(next);
  };

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      toast.success("API key copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>API key created</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning-light/30 p-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning-dark" />
            <div>
              <p className="font-medium text-warning-dark">
                Save this API key now. It will not be shown again.
              </p>
              {warning && <p className="mt-1 text-text-secondary">{warning}</p>}
            </div>
          </div>
          {keyPrefix && (
            <p className="text-sm text-text-muted">
              Key prefix: <span className="font-mono">{keyPrefix}</span>
            </p>
          )}
          <div className="rounded-md border border-border bg-surface-2 p-3 font-mono text-sm break-all">
            {apiKey ?? "—"}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleCopy()} disabled={!apiKey}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copy key
          </Button>
          <Button type="button" onClick={() => handleClose(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
