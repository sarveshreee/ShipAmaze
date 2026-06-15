import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Truck, Package, MapPin, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import {
  AuthFormFooter,
  AuthFormHeader,
  authInputClass,
  authLabelClass,
  authSubmitClass,
} from "@/components/auth/authFormStyles";
import { AUTH_SIGNUP_HERO } from "@/lib/brandAssets";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { roleDashboardPath, type SignupRole } from "@/services/authService";

const roles: { value: SignupRole; label: string; icon: React.ReactNode }[] = [
  { value: "vendor", label: "Vendor", icon: <Package className="h-4 w-4" /> },
  { value: "dropshipper", label: "Dropshipper", icon: <Truck className="h-4 w-4" /> },
];

const highlights = [
  { icon: Package, text: "Multi-courier aggregation with smart routing" },
  { icon: MapPin, text: "28,000+ pin codes covered across India" },
  { icon: Truck, text: "Real-time tracking & automated NDR management" },
];

const inputClass = authInputClass;

export default function SignupPage() {
  const [role, setRole] = useState<SignupRole>("dropshipper");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signupWithEmail } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!fullName || !trimmedEmail || !password) {
      toast.error("Please fill all required fields");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!agreed) {
      toast.error("Please agree to the Terms of Service");
      return;
    }

    setLoading(true);
    const { error, needsVerification, verifyEmail } = await signupWithEmail(
      trimmedEmail,
      password,
      fullName,
      businessName,
      phone,
      role
    );
    setLoading(false);

    if (error) {
      toast.error(error);
    } else if (needsVerification && verifyEmail) {
      toast.success("Check your email for a verification code.");
      navigate(`/verify-email?email=${encodeURIComponent(verifyEmail)}`, { replace: true });
    } else {
      toast.success("Account created successfully!");
      navigate(roleDashboardPath(role), { replace: true });
    }
  };

  return (
    <AuthPageLayout
      heroImage={AUTH_SIGNUP_HERO}
      heroAlt="ShipAmaze global AI-powered logistics network"
      variant="signup"
    >
      <AuthFormHeader title="Create your account" subtitle="Get started with ShipAmaze in minutes" />

      <ul className="auth-field mb-5 space-y-2 lg:hidden">
        {highlights.map((item) => (
          <li
            key={item.text}
            className="flex items-center gap-2.5 rounded-xl border border-[hsl(var(--color-primary)/0.15)] bg-white/80 px-3 py-2 text-xs text-[hsl(24_12%_38%)]"
          >
            <item.icon className="h-4 w-4 shrink-0 text-[hsl(var(--color-primary))]" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="auth-field grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className={authLabelClass}>Full Name *</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Amit Sharma"
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label className={authLabelClass}>Phone</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98000 00000"
              className={inputClass}
            />
          </div>
        </div>

        <div className="auth-field space-y-2">
          <label className={authLabelClass}>Email *</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="amit@example.com"
            className={inputClass}
          />
        </div>

        <div className="auth-field space-y-2">
          <label className={authLabelClass}>Business Name</label>
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Your business name"
            className={inputClass}
          />
        </div>

        <div className="auth-field grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className={authLabelClass}>Password *</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={cn(inputClass, "pr-9")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[hsl(24_8%_50%)] hover:text-[hsl(var(--color-primary))] transition-colors"
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className={authLabelClass}>Confirm Password *</label>
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={cn(inputClass, "pr-9")}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[hsl(24_8%_50%)] hover:text-[hsl(var(--color-primary))] transition-colors"
              >
                {showConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="auth-field space-y-2">
          <label className={authLabelClass}>Register as</label>
          <div className="grid grid-cols-2 gap-2">
            {roles.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={cn(
                  "auth-role-btn flex flex-col items-center gap-1.5 py-3 text-sm font-medium",
                  role === r.value
                    ? "auth-role-btn--active"
                    : "bg-white/90 text-[hsl(24_12%_38%)]"
                )}
              >
                {r.icon}
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <label className="auth-field flex items-start gap-2.5 text-xs text-[hsl(24_12%_38%)] pt-1">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 rounded border-[hsl(30_20%_86%)] accent-[hsl(24_95%_53%)]"
          />
          I agree to the{" "}
          <a href="#" className="auth-link hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="auth-link hover:underline">
            Privacy Policy
          </a>
        </label>

        <Button type="submit" disabled={loading} className={authSubmitClass}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Create Account
          <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>
      </form>

      <AuthFormFooter className="mt-5">
        Already have an account?{" "}
        <Link to="/login" className="auth-link">
          Sign in
        </Link>
      </AuthFormFooter>
    </AuthPageLayout>
  );
}
