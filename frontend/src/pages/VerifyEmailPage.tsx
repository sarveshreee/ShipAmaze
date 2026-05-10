import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Truck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import * as authService from "@/services/authService";
import { ApiError } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";

const RESEND_COOLDOWN_SEC = 60;

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { applyUser } = useAuth();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLeft, setResendLeft] = useState(0);

  useEffect(() => {
    const q = searchParams.get("email")?.trim().toLowerCase() ?? "";
    if (q) setEmail(q);
  }, [searchParams]);

  useEffect(() => {
    if (resendLeft <= 0) return;
    const t = setInterval(() => setResendLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendLeft]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    const code = otp.trim();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast.error("Enter the email you registered with");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    setLoading(true);
    try {
      const { user } = await authService.verifyEmailOtp(em, code);
      applyUser(user);
      toast.success("Email verified. Welcome to ShipAmaze!");
      navigate(authService.roleDashboardPath(user.role), { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    const em = email.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast.error("Enter your email first");
      return;
    }
    if (resendLeft > 0) return;
    setLoading(true);
    try {
      await authService.resendEmailVerificationOtp(em);
      toast.success("If this account is awaiting verification, a new code was sent.");
      setResendLeft(RESEND_COOLDOWN_SEC);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not resend code");
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
        <Truck className="h-12 w-12 text-white mb-4" />
        <h1 className="text-2xl font-bold text-white">ShipAmaze</h1>
        <p className="text-white/70 text-sm mt-2 text-center max-w-xs">Verify your email to activate your account</p>
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

          <form onSubmit={submit} className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Verify your email</h2>
              <p className="text-sm text-text-muted mt-1">We sent a 6-digit code to your inbox (check spam).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ve-email">Email</Label>
              <Input
                id="ve-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ve-otp">One-time code</Label>
              <Input
                id="ve-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="tracking-widest text-lg font-mono"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & continue"}
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
              <button
                type="button"
                className="text-primary font-medium hover:underline disabled:opacity-50 disabled:pointer-events-none text-left"
                disabled={loading || resendLeft > 0}
                onClick={() => void resend()}
              >
                {resendLeft > 0 ? `Resend code (${resendLeft}s)` : "Resend code"}
              </button>
              <Link to="/signup" className="text-text-muted hover:text-primary hover:underline">
                Wrong email? Sign up again
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
