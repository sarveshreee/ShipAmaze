import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import {
  AuthFormFooter,
  AuthFormHeader,
  authInputClass,
  authLabelClass,
  authSubmitClass,
} from "@/components/auth/authFormStyles";
import { AUTH_LOGIN_HERO } from "@/lib/brandAssets";
import { toast } from "sonner";
import { roleDashboardPath, resendEmailVerificationOtp } from "@/services/authService";
import { ApiError } from "@/lib/apiClient";
import { cn } from "@/lib/utils";

const inputClass = authInputClass;

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { loginWithEmail } = useAuth();
  const navigate = useNavigate();
  const [verifyHint, setVerifyHint] = useState(false);

  useEffect(() => {
    const hint = searchParams.get("unverified");
    const em = searchParams.get("email")?.trim();
    if (em) setEmail(em);
    if (hint === "1") {
      toast.message("Please verify your email before logging in.", {
        description: "Use Verify email below after entering your password, or open the link from your inbox.",
      });
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast.error(!trimmedEmail ? "Please enter your email" : "Please enter your password");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setLoading(true);
    const { error, user } = await loginWithEmail(trimmedEmail, password);
    setLoading(false);

    if (error) {
      toast.error(error);
      setVerifyHint(error.toLowerCase().includes("verify your email"));
    } else if (user) {
      setVerifyHint(false);
      toast.success("Logged in successfully!");
      navigate(roleDashboardPath(user.role), { replace: true });
    }
  };

  return (
    <AuthPageLayout
      heroImage={AUTH_LOGIN_HERO}
      heroAlt="ShipAmaze AI-powered logistics platform"
      variant="login"
    >
      <AuthFormHeader
        title="Welcome back"
        subtitle="Sign in to manage shipments on your AI-powered logistics platform"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="auth-field space-y-2">
          <label htmlFor="email" className={authLabelClass}>
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>

        <div className="auth-field space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="password" className={authLabelClass}>
              Password
            </label>
            <Link to="/forgot-password" className="auth-link text-xs shrink-0">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={cn(inputClass, "pr-10")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(24_8%_50%)] hover:text-[hsl(var(--color-primary))] transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" disabled={loading} className={authSubmitClass}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Sign In
          <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>

        {verifyHint && (
          <div className="auth-field rounded-xl border border-[hsl(var(--color-primary)/0.2)] bg-[hsl(var(--color-primary-light)/0.7)] px-3 py-2.5 text-sm text-center text-[hsl(24_12%_38%)]">
            <Link
              to={`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`}
              className="auth-link"
            >
              Verify email
            </Link>
            <span className="text-[hsl(24_8%_55%)]"> · </span>
            <button
              type="button"
              className="auth-link"
              disabled={loading}
              onClick={async () => {
                const em = email.trim().toLowerCase();
                if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
                  toast.error("Enter your email above first");
                  return;
                }
                setLoading(true);
                try {
                  await resendEmailVerificationOtp(em);
                  toast.success("If this account is awaiting verification, a new code was sent.");
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : "Could not resend");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Resend code
            </button>
          </div>
        )}
      </form>

      <AuthFormFooter>
        Don&apos;t have an account?{" "}
        <Link to="/signup" className="auth-link">
          Sign up
        </Link>
      </AuthFormFooter>
    </AuthPageLayout>
  );
}
