import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Truck, Package, MapPin, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Role = "admin" | "vendor" | "dropshipper";

const roles: { value: Role; label: string; icon: React.ReactNode }[] = [
  { value: "admin", label: "Admin", icon: <MapPin className="h-4 w-4" /> },
  { value: "vendor", label: "Vendor", icon: <Package className="h-4 w-4" /> },
  { value: "dropshipper", label: "Dropshipper", icon: <Truck className="h-4 w-4" /> },
];

const redirectMap: Record<Role, string> = {
  admin: "/admin",
  vendor: "/vendor",
  dropshipper: "/dropshipper",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"real" | "demo">("real");
  const { login, loginWithEmail } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === "demo") {
      login(role);
      navigate(redirectMap[role]);
      toast.success(`Logged in as ${role} (Demo Mode)`);
      return;
    }

    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setLoading(true);
    const { error } = await loginWithEmail(email, password);
    setLoading(false);

    if (error) {
      toast.error(error);
    } else {
      toast.success("Logged in successfully!");
      // Role will be fetched from DB, redirect after a brief delay
      setTimeout(() => navigate(redirectMap[role]), 500);
    }
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      {/* Left side - branding with animation */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center relative p-12"
        style={{ background: "linear-gradient(135deg, hsl(var(--color-primary-dark)), hsl(var(--color-tertiary-dark)))" }}
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
            <path d="M0,60 Q150,10 300,60 T600,60" fill="none" stroke="white" strokeWidth="2" strokeDasharray="8 6" className="animate-dash" />
          </svg>
        </div>

        <div className="relative z-10 text-center max-w-md animate-fade-in-up">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm mx-auto mb-6 border border-white/20">
            <Truck className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">ShipFlow</h1>
          <p className="text-lg text-white/70 mb-8">India's smartest logistics platform</p>
          <div className="flex items-center gap-4 justify-center text-white/50 text-sm">
            <span className="flex items-center gap-1.5"><Package className="h-4 w-4" /> 24K+ Orders</span>
            <span className="w-1 h-1 rounded-full bg-white/30" />
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> 500+ Cities</span>
            <span className="w-1 h-1 rounded-full bg-white/30" />
            <span className="flex items-center gap-1.5"><Truck className="h-4 w-4" /> 6 Couriers</span>
          </div>
        </div>
      </div>

      {/* Right side - form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[420px] animate-fade-in-up">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-3">
              <Truck className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary">ShipFlow</h1>
            <p className="text-sm text-text-muted">India's smartest logistics platform</p>
          </div>

          <div className="mb-6 lg:mb-8">
            <h2 className="text-2xl font-bold text-text-primary">Welcome back</h2>
            <p className="text-sm text-text-muted mt-1">Sign in to manage your shipments</p>
          </div>

          {/* Mode Toggle */}
          <div className="flex rounded-lg bg-surface-2 p-1 mb-5">
            <button onClick={() => setMode("real")} className={cn("flex-1 rounded-md py-2 text-sm font-medium transition-all", mode === "real" ? "bg-card text-text-primary shadow-sm" : "text-text-muted")}>
              Email Login
            </button>
            <button onClick={() => setMode("demo")} className={cn("flex-1 rounded-md py-2 text-sm font-medium transition-all", mode === "demo" ? "bg-card text-text-primary shadow-sm" : "text-text-muted")}>
              Demo Access
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "real" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                  </div>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="h-11 pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {mode === "demo" && (
              <div className="space-y-2">
                <Label>Login as</Label>
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
                <p className="text-xs text-text-muted text-center mt-2">Demo mode uses sample data — no account needed</p>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary-dark group">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {mode === "demo" ? "Enter Demo" : "Sign In"}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-text-secondary">
            Don't have an account? <a href="/signup" className="text-primary font-medium hover:underline">Sign up</a>
          </p>
        </div>
      </div>
    </div>
  );
}
