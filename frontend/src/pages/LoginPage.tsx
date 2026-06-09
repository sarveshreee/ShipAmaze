import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Truck, Package, MapPin, ArrowRight, Loader2 } from "lucide-react";
import { ShipAmazeLogo } from "@/components/brand/ShipAmazeLogo";
import { toast } from "sonner";
import { roleDashboardPath, resendEmailVerificationOtp } from "@/services/authService";
import { ApiError } from "@/lib/apiClient";

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
    <div className="relative flex min-h-screen overflow-hidden">
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center relative p-12"
        style={{
          background: "linear-gradient(135deg, hsl(var(--color-primary-dark)), hsl(var(--color-tertiary-dark)))",
        }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[15%] left-[10%] animate-float-slow opacity-20">
            <Package className="h-16 w-16 text-white" />
          </div>
          <div className="absolute top-[60%] left-[15%] animate-float-medium opacity-15">
            <MapPin className="h-12 w-12 text-white" />
          </div>
          <div className="absolute top-[30%] right-[12%] animate-float-fast opacity-20">
            <Truck className="h-14 w-14 text-white" />
          </div>
          <div className="absolute bottom-[20%] right-[20%] animate-float-slow opacity-10">
            <Package className="h-20 w-20 text-white" />
          </div>
          <svg className="absolute bottom-[35%] left-0 w-full h-32 opacity-10" viewBox="0 0 600 120">
            <path
              d="M0,60 Q150,10 300,60 T600,60"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeDasharray="8 6"
              className="animate-dash"
            />
          </svg>
        </div>

        <div className="relative z-10 text-center max-w-md animate-fade-in-up">
          <ShipAmazeLogo placement="auth-hero" className="mx-auto mb-6" />
          <p className="text-lg text-white/70 mb-8">Logistics and marketplace operations</p>
        </div>
      </div>

      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[420px] animate-fade-in-up">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <ShipAmazeLogo placement="auth-form" className="mb-3" />
            <p className="text-sm text-text-muted">Sign in with your account</p>
          </div>

          <div className="mb-6 lg:mb-8">
            <h2 className="text-2xl font-bold text-text-primary">Welcome back</h2>
            <p className="text-sm text-text-muted mt-1">Sign in to manage your shipments</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary font-medium hover:underline shrink-0">
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
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary-dark group">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sign In
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            {verifyHint && (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-center text-text-secondary">
                <Link
                  to={`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                  className="text-primary font-semibold hover:underline"
                >
                  Verify email
                </Link>
                <span className="text-text-muted"> · </span>
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
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

          <p className="mt-6 text-center text-sm text-text-secondary">
            Don&apos;t have an account?{" "}
            <a href="/signup" className="text-primary font-medium hover:underline">
              Sign up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
