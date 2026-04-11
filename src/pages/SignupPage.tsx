import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, Package, MapPin, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Role = "admin" | "vendor" | "dropshipper";
const roles: { value: Role; label: string; icon: React.ReactNode }[] = [
  { value: "admin", label: "Admin", icon: <MapPin className="h-4 w-4" /> },
  { value: "vendor", label: "Vendor", icon: <Package className="h-4 w-4" /> },
  { value: "dropshipper", label: "Dropshipper", icon: <Truck className="h-4 w-4" /> },
];

const redirectMap: Record<Role, string> = { admin: "/admin", vendor: "/vendor", dropshipper: "/dropshipper" };

export default function SignupPage() {
  const [role, setRole] = useState<Role>("dropshipper");
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
    if (!fullName || !email || !password) {
      toast.error("Please fill all required fields");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (!agreed) {
      toast.error("Please agree to the Terms of Service");
      return;
    }

    setLoading(true);
    const { error } = await signupWithEmail(email, password, fullName, businessName, phone, role);
    setLoading(false);

    if (error) {
      toast.error(error);
    } else {
      toast.success("Account created successfully!");
      navigate(redirectMap[role]);
    }
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center relative p-12"
        style={{ background: "linear-gradient(135deg, hsl(var(--color-primary-dark)), hsl(var(--color-tertiary-dark)))" }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[15%] left-[10%] animate-float-slow opacity-20"><Package className="h-16 w-16 text-white" /></div>
          <div className="absolute top-[55%] left-[20%] animate-float-medium opacity-15"><MapPin className="h-12 w-12 text-white" /></div>
          <div className="absolute top-[25%] right-[12%] animate-float-fast opacity-20"><Truck className="h-14 w-14 text-white" /></div>
          <div className="absolute bottom-[18%] right-[15%] animate-float-slow opacity-10"><Package className="h-20 w-20 text-white" /></div>
          <svg className="absolute bottom-[35%] left-0 w-full h-32 opacity-10" viewBox="0 0 600 120">
            <path d="M0,60 Q150,10 300,60 T600,60" fill="none" stroke="white" strokeWidth="2" strokeDasharray="8 6" className="animate-dash" />
          </svg>
        </div>
        <div className="relative z-10 text-center max-w-md animate-fade-in-up">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm mx-auto mb-6 border border-white/20">
            <Truck className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">ShipFlow</h1>
          <p className="text-lg text-white/70 mb-8">Start shipping smarter today</p>
          <div className="space-y-3 text-left text-white/60 text-sm">
            {[
              { icon: Package, text: "Multi-courier aggregation with smart routing" },
              { icon: MapPin, text: "28,000+ pin codes covered across India" },
              { icon: Truck, text: "Real-time tracking & automated NDR management" },
            ].map(item => (
              <div key={item.text} className="flex items-center gap-3 bg-white/5 rounded-lg px-4 py-3 backdrop-blur-sm border border-white/10">
                <item.icon className="h-5 w-5 text-white/80 shrink-0" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[420px] animate-fade-in-up">
          <div className="mb-6 flex flex-col items-center text-center lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-3"><Truck className="h-7 w-7" /></div>
            <h1 className="text-2xl font-bold text-text-primary">ShipFlow</h1>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-text-primary">Create your account</h2>
            <p className="text-sm text-text-muted mt-1">Get started with ShipFlow in minutes</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Amit Sharma" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98000 00000" className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="amit@example.com" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Business Name</Label>
              <Input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Your business name" className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Password *</Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="h-10 pr-9" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Confirm Password *</Label>
                <div className="relative">
                  <Input type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" className="h-10 pr-9" />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                    {showConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Register as</Label>
              <div className="grid grid-cols-3 gap-2">
                {roles.map(r => (
                  <button key={r.value} type="button" onClick={() => setRole(r.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl py-3 text-sm font-medium transition-all border-2",
                      role === r.value
                        ? "bg-primary text-primary-foreground border-primary shadow-md scale-[1.02]"
                        : "bg-surface-2 text-text-secondary border-transparent hover:border-border hover:bg-surface-2/80"
                    )}>
                    {r.icon}
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-text-secondary pt-1">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 rounded border-border accent-primary" />
              I agree to the <a href="#" className="text-primary hover:underline">Terms of Service</a> and <a href="#" className="text-primary hover:underline">Privacy Policy</a>
            </label>

            <Button type="submit" disabled={loading} className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary-dark group">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Account
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-text-secondary">
            Already have an account? <a href="/login" className="text-primary font-medium hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
