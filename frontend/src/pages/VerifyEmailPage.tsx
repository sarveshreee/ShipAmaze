import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, MailCheck, ShieldCheck, AlertCircle } from "lucide-react";
import { ShipAmazeLogo } from "@/components/brand/ShipAmazeLogo";
import { toast } from "sonner";
import * as authService from "@/services/authService";
import { ApiError } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { OtpInputBoxes } from "@/components/auth/OtpInputBoxes";

const RESEND_COOLDOWN_SEC = 60;

type VerifyState = "idle" | "success" | "error";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { applyUser } = useAuth();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLeft, setResendLeft] = useState(RESEND_COOLDOWN_SEC);
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

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
      toast.error("Enter the complete 6-digit code");
      return;
    }
    setLoading(true);
    setVerifyState("idle");
    setErrorMessage("");
    try {
      const { user } = await authService.verifyOtp(em, code);
      setVerifyState("success");
      applyUser(user);
      toast.success("Email verified. Welcome to ShipAmaze!");
      setTimeout(() => {
        navigate(authService.roleDashboardPath(user.role), { replace: true });
      }, 600);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Verification failed";
      setVerifyState("error");
      setErrorMessage(msg);
      toast.error(msg);
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
    setVerifyState("idle");
    setErrorMessage("");
    try {
      await authService.resendOtp(em);
      toast.success("If this account is awaiting verification, a new code was sent.");
      setResendLeft(RESEND_COOLDOWN_SEC);
      setOtp("");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not resend code";
      toast.error(msg);
      if (err instanceof ApiError && err.status === 429) {
        const match = msg.match(/(\d+)\s+seconds/);
        if (match) setResendLeft(Number(match[1]));
      }
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
        <p className="text-white/70 text-sm mt-2 text-center max-w-xs">Verify your email to activate your account</p>
        <div className="mt-8 space-y-3 text-white/80 text-sm max-w-xs">
          <p className="flex items-center gap-2">
            <MailCheck className="h-4 w-4 shrink-0" />
            Check your inbox and spam folder
          </p>
          <p className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Codes expire in 5 minutes
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[440px]">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Verify your email</h2>
              <p className="text-sm text-text-muted mt-1">
                Enter the 6-digit code we sent to your email. Your account stays inactive until verified.
              </p>
            </div>

            {verifyState === "success" && (
              <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
                <MailCheck className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Email verified</p>
                  <p className="text-success/80 mt-0.5">Redirecting to your dashboard…</p>
                </div>
              </div>
            )}

            {verifyState === "error" && errorMessage && (
              <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <p>{errorMessage}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ve-email">Email</Label>
              <Input
                id="ve-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading || verifyState === "success"}
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="ve-otp">Verification code</Label>
              <OtpInputBoxes
                id="ve-otp"
                value={otp}
                onChange={setOtp}
                disabled={loading || verifyState === "success"}
              />
              <p className="text-xs text-text-muted text-center">Enter all 6 digits from your email</p>
            </div>

            <Button type="submit" className="w-full" disabled={loading || verifyState === "success" || otp.length < 6}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Verifying…
                </>
              ) : verifyState === "success" ? (
                "Verified"
              ) : (
                "Verify & continue"
              )}
            </Button>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
              <button
                type="button"
                className="text-primary font-medium hover:underline disabled:opacity-50 disabled:pointer-events-none text-left"
                disabled={loading || resendLeft > 0 || verifyState === "success"}
                onClick={() => void resend()}
              >
                {resendLeft > 0 ? `Resend code in ${resendLeft}s` : "Resend code"}
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
