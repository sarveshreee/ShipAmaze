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
import type { AuthUser } from "@/services/authService";
import * as authService from "@/services/authService";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser | null;
  onSaved: (user: AuthUser) => void;
}

export function ProfileEditModal({ open, onOpenChange, user, onSaved }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setCompanyName(user.companyName ?? "");
    setAddress(user.address ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
  }, [open, user]);

  if (!user) return null;

  const initial = (name || user.name || "U").trim().charAt(0).toUpperCase();

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const { user: next } = await authService.updateProfile({
        name: trimmed,
        phone: phone.trim(),
        companyName: companyName.trim(),
        address: address.trim(),
        avatarUrl: avatarUrl.trim() === "" ? null : avatarUrl.trim(),
      });
      onSaved(next);
      toast.success("Profile updated");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Update your details. Email and role cannot be changed here.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-6 py-2">
          <div className="flex flex-col items-center gap-2 shrink-0">
            {avatarUrl.trim() ? (
              <img
                src={avatarUrl.trim()}
                alt=""
                className="h-20 w-20 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
                {initial}
              </div>
            )}
            <p className="text-xs text-text-muted text-center">Initial uses your name if no image URL</p>
          </div>

          <div className="flex-1 space-y-3 min-w-0">
            <div className="space-y-1.5">
              <Label htmlFor="pf-name">Name</Label>
              <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-phone">Phone</Label>
              <Input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-company">Company name</Label>
              <Input id="pf-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-address">Address (optional)</Label>
              <Input id="pf-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-avatar">Avatar image URL (optional)</Label>
              <Input
                id="pf-avatar"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={user.email} disabled className="bg-surface-2/80" readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Input value={user.role} disabled className="bg-surface-2/80 capitalize" readOnly />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" className="bg-primary text-primary-foreground hover:bg-primary-dark" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
