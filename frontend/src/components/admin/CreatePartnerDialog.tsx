import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import * as partnerService from "@/services/partnerService";
import type { PartnerProvider } from "@/services/partnerService";
import * as userService from "@/services/userService";
import type { AdminUserRow } from "@/services/userService";

const PROVIDERS: { id: PartnerProvider; label: string }[] = [
  { id: "velocity", label: "Velocity" },
  { id: "lorrigo", label: "Lorrigo" },
  { id: "ekart", label: "Ekart" },
];

interface CreatePartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletBillingEnabled: boolean;
  onCreated: () => void;
}

export function CreatePartnerDialog({
  open,
  onOpenChange,
  walletBillingEnabled,
  onCreated,
}: CreatePartnerDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linkedUserId, setLinkedUserId] = useState("");
  const [allowedProviders, setAllowedProviders] = useState<PartnerProvider[]>([
    "velocity",
    "lorrigo",
    "ekart",
  ]);
  const [userSearch, setUserSearch] = useState("");
  const [userSearchDebounced, setUserSearchDebounced] = useState("");
  const [userOptions, setUserOptions] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setUserSearchDebounced(userSearch.trim()), 300);
    return () => window.clearTimeout(t);
  }, [userSearch]);

  const loadUsers = useCallback(async () => {
    if (!open) return;
    setUsersLoading(true);
    try {
      const roles = walletBillingEnabled ? ["dropshipper"] : ["dropshipper", "vendor"];
      const results = await Promise.all(
        roles.map((role) =>
          userService.adminListUsers({
            role,
            page: "1",
            limit: "50",
            search: userSearchDebounced || undefined,
            status: "active",
          })
        )
      );
      const merged = new Map<string, AdminUserRow>();
      for (const r of results) {
        for (const u of r.items ?? []) merged.set(u.id, u);
      }
      setUserOptions(Array.from(merged.values()));
    } catch {
      setUserOptions([]);
    } finally {
      setUsersLoading(false);
    }
  }, [open, userSearchDebounced, walletBillingEnabled]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setLinkedUserId("");
    setAllowedProviders(["velocity", "lorrigo", "ekart"]);
    setUserSearch("");
  };

  const handleClose = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const toggleProvider = (id: PartnerProvider, checked: boolean) => {
    setAllowedProviders((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((p) => p !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !linkedUserId) {
      toast.error("Partner name and linked user are required");
      return;
    }
    setSubmitting(true);
    try {
      await partnerService.createPartner({
        name: trimmedName,
        description: description.trim() || undefined,
        linkedUserId,
        allowedProviders: allowedProviders.length ? allowedProviders : undefined,
      });
      toast.success("Partner created");
      onCreated();
      handleClose(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to create partner");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedUser = userOptions.find((u) => u.id === linkedUserId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Partner</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="partner-name">Partner name</Label>
            <Input
              id="partner-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="External integration name"
              maxLength={200}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="partner-description">Description (optional)</Label>
            <Input
              id="partner-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Internal notes"
              maxLength={500}
            />
          </div>
          <div className="space-y-2">
            <Label>Linked ShipAmaze user</Label>
            {walletBillingEnabled && (
              <p className="text-xs text-text-muted">
                Wallet billing is enabled on the server. The linked user must be a dropshipper.
              </p>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                className="pl-9"
                placeholder="Search users by name or email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              {usersLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading users…
                </div>
              ) : userOptions.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-muted">No matching users</p>
              ) : (
                userOptions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                      linkedUserId === u.id ? "bg-primary/10" : ""
                    }`}
                    onClick={() => setLinkedUserId(u.id)}
                  >
                    <span className="font-medium">{u.name}</span>
                    <span className="text-text-muted"> · {u.email}</span>
                    <span className="text-text-muted"> · {u.role}</span>
                  </button>
                ))
              )}
            </div>
            {selectedUser && (
              <p className="text-xs text-text-secondary">
                Selected: {selectedUser.name} ({selectedUser.email}) — {selectedUser.role}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Allowed providers (optional)</Label>
            <div className="flex flex-wrap gap-4">
              {PROVIDERS.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allowedProviders.includes(p.id)}
                    onCheckedChange={(v) => toggleProvider(p.id, v === true)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Partner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
