import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import * as authService from "@/services/authService";
import { ApiError } from "@/lib/apiClient";

export default function ChangePassword() {
  const { role } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState({ c: false, n: false, k: false });
  const [saving, setSaving] = useState(false);

  const validate = () => {
    if (!current) return "Current password is required";
    if (!next) return "New password is required";
    if (next.length < 8) return "New password must be at least 8 characters";
    if (next !== confirm) return "New password and confirm password do not match";
    if (next === current) return "New password must be different from current password";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      await authService.changePassword({
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
      toast.success("Password updated successfully");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e: unknown) {
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed to update password");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setCurrent(""); setNext(""); setConfirm(""); };

  const Field = ({ label, value, onChange, visible, toggle, placeholder }: any) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 pr-9"
        />
        <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in-up max-w-2xl">
      <PageHeader
        title="Change Password"
        breadcrumb={[role.charAt(0).toUpperCase() + role.slice(1), "Change Password"]}
      />
      <Card className="p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-text-primary">Update your password</h3>
          <p className="text-sm text-text-muted mt-0.5">Use a strong password with at least 8 characters.</p>
          <p className="text-sm text-text-muted mt-2">
            Forgot your current password?{" "}
            <Link to="/forgot-password" className="text-primary font-medium hover:underline">
              Reset with email code
            </Link>
          </p>
        </div>

        <Field
          label="Current Password"
          value={current}
          onChange={setCurrent}
          visible={show.c}
          toggle={() => setShow((s) => ({ ...s, c: !s.c }))}
          placeholder="Enter current password"
        />
        <Field
          label="New Password"
          value={next}
          onChange={setNext}
          visible={show.n}
          toggle={() => setShow((s) => ({ ...s, n: !s.n }))}
          placeholder="Enter new password"
        />
        <Field
          label="Confirm New Password"
          value={confirm}
          onChange={setConfirm}
          visible={show.k}
          toggle={() => setShow((s) => ({ ...s, k: !s.k }))}
          placeholder="Re-enter new password"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Update Password
          </Button>
        </div>
      </Card>
    </div>
  );
}
