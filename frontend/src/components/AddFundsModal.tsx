import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as walletService from "@/services/walletService";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";

const MIN_AMOUNT = 100;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddFundsModal({ open, onOpenChange, onSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setAmount("");
  }, [open]);

  const submit = async () => {
    const n = Number(String(amount).replace(/,/g, ""));
    if (!Number.isFinite(n) || n < MIN_AMOUNT) {
      toast.error(`Minimum amount is ₹${MIN_AMOUNT}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await walletService.addFunds(n);
      toast.success(res.message || "Funds request submitted");
      window.dispatchEvent(new Event("shipamaze:refetch:wallet"));
      window.dispatchEvent(new Event("shipamaze:refetch:transactions"));
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not submit add funds request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>
            Enter an amount to add to your wallet. Payment gateway is not connected yet — this creates a{" "}
            <span className="font-medium">pending</span> manual credit request (minimum ₹{MIN_AMOUNT}).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="add-funds-amount">Amount (₹)</Label>
          <Input
            id="add-funds-amount"
            type="number"
            min={MIN_AMOUNT}
            step="1"
            inputMode="decimal"
            placeholder={`e.g. ${MIN_AMOUNT}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" className="bg-primary text-primary-foreground hover:bg-primary-dark" disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
