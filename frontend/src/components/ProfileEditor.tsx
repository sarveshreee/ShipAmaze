import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AuthUser } from "@/services/authService";
import * as authService from "@/services/authService";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import { Building2, Mail, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  user: AuthUser;
  onSaved: (user: AuthUser) => void;
  onCancel?: () => void;
  layout?: "default" | "split";
}

function isValidPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^[\d\s+\-()]{7,18}$/.test(trimmed);
}

function isValidAvatarUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function ProfileEditor({ user, onSaved, onCancel, layout = "default" }: Props) {
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
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  const isDirty = useMemo(
    () =>
      name.trim() !== (user.name ?? "").trim() ||
      phone.trim() !== (user.phone ?? "").trim() ||
      companyName.trim() !== (user.companyName ?? "").trim() ||
      address.trim() !== (user.address ?? "").trim() ||
      avatarUrl.trim() !== (user.avatarUrl ?? "").trim(),
    [name, phone, companyName, address, avatarUrl, user],
  );

  const phoneError = phone.trim() && !isValidPhone(phone) ? "Enter a valid phone number" : "";
  const avatarError =
    avatarUrl.trim() && !isValidAvatarUrl(avatarUrl) ? "Enter a valid http(s) image URL" : "";

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    if (!isValidPhone(phone)) {
      toast.error("Please enter a valid phone number");
      return;
    }
    if (!isValidAvatarUrl(avatarUrl)) {
      toast.error("Please enter a valid avatar URL");
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
      toast.success("Profile updated successfully");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update profile");
    } finally {
      setSaving(false);
    }
  };

  const summaryCard = (
    <Card className="border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
        {avatarUrl.trim() ? (
          <img
            src={avatarUrl.trim()}
            alt=""
            className="h-24 w-24 rounded-2xl border-2 border-border object-cover shadow-sm"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-indigo-600 text-3xl font-bold text-white shadow-md">
            {initial}
          </div>
        )}
        <h2 className="mt-4 text-xl font-semibold text-text-primary">{name.trim() || user.name || "User"}</h2>
        <Badge variant="secondary" className="mt-2 capitalize bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
          {roleLabel}
        </Badge>
        {companyName.trim() && (
          <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
            <Building2 className="h-4 w-4 shrink-0" />
            {companyName.trim()}
          </p>
        )}
        <p className="mt-2 flex items-center gap-2 text-sm text-text-muted">
          <Mail className="h-4 w-4 shrink-0" />
          <span className="truncate">{user.email}</span>
        </p>
      </div>
    </Card>
  );

  const formFields = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pf-name">Full name *</Label>
        <Input
          id="pf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="bg-background"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-phone">Phone</Label>
          <Input
            id="pf-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            className={cn("bg-background", phoneError && "border-danger")}
          />
          {phoneError && <p className="text-xs text-danger">{phoneError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-company">Company name</Label>
          <Input
            id="pf-company"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="bg-background"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-address">Address</Label>
        <Input
          id="pf-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="bg-background"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-avatar">Avatar image URL</Label>
        <Input
          id="pf-avatar"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://example.com/avatar.jpg"
          className={cn("bg-background", avatarError && "border-danger")}
        />
        {avatarError && <p className="text-xs text-danger">{avatarError}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={user.email} disabled readOnly className="bg-surface-2/80 text-text-muted" />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Input value={roleLabel} disabled readOnly className="bg-surface-2/80 capitalize text-text-muted" />
        </div>
      </div>
    </div>
  );

  const actions = (
    <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
      {onCancel ? (
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      ) : null}
      <Button
        type="button"
        className="bg-indigo-600 text-white hover:bg-indigo-700"
        disabled={saving || !isDirty || !!phoneError || !!avatarError}
        onClick={() => void save()}
      >
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );

  if (layout === "split") {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {summaryCard}
        <Card className="border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-semibold text-text-primary">Account details</h3>
          </div>
          {formFields}
          {actions}
        </Card>
      </div>
    );
  }

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
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-lg font-semibold text-white sm:h-16 sm:w-16 sm:text-xl">
              {initial}
            </div>
          )}
          <p className="text-[11px] leading-tight text-text-muted sm:text-center sm:text-xs">
            Initial from your name if no image URL is set.
          </p>
        </div>
        <div className="min-w-0 flex-1">{formFields}</div>
      </div>
      {actions}
    </>
  );
}
