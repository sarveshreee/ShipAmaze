import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import * as userService from "@/services/userService";
import type { UserRole } from "@/services/authService";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "vendor", label: "Vendor" },
  { value: "dropshipper", label: "Dropshipper" },
];

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateUserDialog({ open, onOpenChange, onCreated }: CreateUserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("vendor");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [accessType, setAccessType] = useState<"FULL" | "RESTRICTED">("FULL");
  const [allowWarehouseAccess, setAllowWarehouseAccess] = useState(true);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPhone("");
    setCompanyName("");
    setPassword("");
    setConfirmPassword("");
    setRole("vendor");
    setStatus("active");
    setAccessType("FULL");
    setAllowWarehouseAccess(true);
    setSendWelcomeEmail(true);
    setShowPassword(false);
    setShowConfirm(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail || !password) {
      toast.error("Please fill all required fields");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await userService.adminCreateUser({
        name: trimmedName,
        email: trimmedEmail,
        password,
        role,
        phone: phone.trim() || undefined,
        companyName: companyName.trim() || undefined,
        status,
        sendWelcomeEmail,
        ...(role === "dropshipper"
          ? { accessType, allowWarehouseAccess }
          : {}),
      });
      toast.success(`${trimmedName} created successfully`);
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cu-name">Full name *</Label>
              <Input
                id="cu-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cu-email">Email *</Label>
              <Input
                id="cu-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-phone">Phone</Label>
              <Input
                id="cu-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                autoComplete="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-company">Company name</Label>
              <Input
                id="cu-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Logistics"
              />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-password">Password *</Label>
              <div className="relative">
                <Input
                  id="cu-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-confirm">Confirm password *</Label>
              <div className="relative">
                <Input
                  id="cu-confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {role === "dropshipper" && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium text-text-primary">Dropshipper access</p>
              <div className="space-y-2">
                <Label>Access type</Label>
                <Select value={accessType} onValueChange={(v) => setAccessType(v as "FULL" | "RESTRICTED")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL">Full access</SelectItem>
                    <SelectItem value="RESTRICTED">Restricted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="cu-warehouse" className="flex-1">Warehouse access</Label>
                <Switch
                  id="cu-warehouse"
                  checked={allowWarehouseAccess}
                  onCheckedChange={setAllowWarehouseAccess}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <Label htmlFor="cu-welcome" className="flex-1 cursor-pointer">
              Send welcome email
            </Label>
            <Switch id="cu-welcome" checked={sendWelcomeEmail} onCheckedChange={setSendWelcomeEmail} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
