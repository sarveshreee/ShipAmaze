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

const MIN_AMOUNT = 1;

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
      toast.error(`Enter an amount of at least ₹${MIN_AMOUNT}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await walletService.addWalletBalance(n, "manual_test");
      const msg = typeof res === "object" && res && "message" in res ? String((res as { message?: string }).message) : "";
      toast.success(msg || "Balance added successfully");
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
          <DialogTitle>Add balance (manual / test)</DialogTitle>
          <DialogDescription>
            No payment gateway is connected. This applies a <span className="font-medium">manual / test recharge</span>{" "}
            immediately to your wallet and records it in your transaction history (minimum ₹{MIN_AMOUNT}).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="add-funds-amount">Amount (₹)</Label>
          <Input
            id="add-funds-amount"
            type="number"
            min={MIN_AMOUNT}
            step="0.01"
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
            {submitting ? "Adding…" : "Add balance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
