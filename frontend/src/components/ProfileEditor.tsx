import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthUser } from "@/services/authService";
import * as authService from "@/services/authService";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";

interface Props {
  user: AuthUser;
  onSaved: (user: AuthUser) => void;
  onCancel?: () => void;
}

export function ProfileEditor({ user, onSaved, onCancel }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
    setCompanyName(user.companyName ?? "");
    setAddress(user.address ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
  }, [user]);

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
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start lg:gap-6">
      <div className="flex shrink-0 flex-row items-center gap-3 sm:w-36 sm:flex-col sm:items-center sm:gap-2 lg:w-40">
        {avatarUrl.trim() ? (
          <img
            src={avatarUrl.trim()}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full border border-border object-cover sm:h-16 sm:w-16"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground sm:h-16 sm:w-16 sm:text-xl">
            {initial}
          </div>
        )}
        <p className="text-[11px] leading-tight text-text-muted sm:text-center sm:text-xs">
          Initial from your name if no image URL is set.
        </p>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-1">
          <Label htmlFor="pf-name" className="text-xs">
            Name
          </Label>
          <Input
            id="pf-name"
            className="h-9"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pf-phone" className="text-xs">
            Phone
          </Label>
          <Input
            id="pf-phone"
            className="h-9"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pf-company" className="text-xs">
            Company name
          </Label>
          <Input
            id="pf-company"
            className="h-9"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pf-address" className="text-xs">
            Address (optional)
          </Label>
          <Input id="pf-address" className="h-9" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pf-avatar" className="text-xs">
            Avatar image URL (optional)
          </Label>
          <Input
            id="pf-avatar"
            className="h-9"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2 sm:gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input value={user.email} disabled className="h-9 bg-surface-2/80" readOnly />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Input value={user.role} disabled className="h-9 bg-surface-2/80 capitalize" readOnly />
          </div>
        </div>
      </div>
    </div>
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          className="bg-primary text-primary-foreground hover:bg-primary-dark"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </>
  );
}
