import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { ShipAmazeLogo } from "@/components/brand/ShipAmazeLogo";
import { toast } from "sonner";
import * as authService from "@/services/authService";
import { ApiError } from "@/lib/apiClient";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState({ n: false, c: false });
  const [loading, setLoading] = useState(false);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      await authService.requestPasswordReset(trimmed);
      toast.success("If an account exists, a code was sent to that email.");
      setStep("reset");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send reset code");
    } finally {
      setLoading(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    const code = otp.trim();
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match");
      return;
    }
    setLoading(true);
    try {
      await authService.resetPasswordWithOtp({
        email: trimmed,
        otp: code,
        newPassword,
        confirmPassword,
      });
      toast.success("Password updated. You can sign in with your new password.");
      window.location.replace(`${window.location.origin}/login`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      <div
        className="hidden lg:flex lg:w-1/3 flex-col items-center justify-center p-10"
        style={{
          background: "linear-gradient(135deg, hsl(var(--color-primary-dark)), hsl(var(--color-tertiary-dark)))",
        }}
      >
        <ShipAmazeLogo placement="auth-hero" className="mb-4" />
        <p className="text-white/70 text-sm mt-2 text-center max-w-xs">Reset your password with a one-time email code</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[420px]">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>

          {step === "email" ? (
            <form onSubmit={sendCode} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-text-primary">Forgot password</h2>
                <p className="text-sm text-text-muted mt-1">
                  We&apos;ll email a 6-digit code. Check spam/promotions. If you self-host: Gmail requires an{" "}
                  <span className="font-medium text-text-secondary">App Password</span> in the API{" "}
                  <code className="text-xs">.env</code>, not your normal Gmail password; otherwise the API only logs the code.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fp-email">Email</Label>
                <Input
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11"
                  autoComplete="email"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary-dark">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send code
              </Button>
            </form>
          ) : (
            <form onSubmit={reset} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-text-primary">Set new password</h2>
                <p className="text-sm text-text-muted mt-1">Code sent to {email.trim() || "your email"}.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fp-otp">6-digit code</Label>
                <Input
                  id="fp-otp"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="h-11 font-mono tracking-widest"
                  autoComplete="one-time-code"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fp-new">New password</Label>
                <div className="relative">
                  <Input
                    id="fp-new"
                    type={show.n ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-11 pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    onClick={() => setShow((s) => ({ ...s, n: !s.n }))}
                  >
                    {show.n ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fp-confirm">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="fp-confirm"
                    type={show.c ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    onClick={() => setShow((s) => ({ ...s, c: !s.c }))}
                  >
                    {show.c ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("email")} disabled={loading}>
                  Change email
                </Button>
                <Button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground hover:bg-primary-dark">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
