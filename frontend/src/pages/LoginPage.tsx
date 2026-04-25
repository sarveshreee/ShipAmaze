import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Truck, Package, MapPin, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { UserRole } from "@/services/authService";

const redirectMap: Record<UserRole, string> = {
  admin: "/admin",
  vendor: "/vendor",
  dropshipper: "/dropshipper/home",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { loginWithEmail } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setLoading(true);
    const { error, user } = await loginWithEmail(email, password);
    setLoading(false);

    if (error) {
      toast.error(error);
    } else if (user) {
      toast.success("Logged in successfully!");
      navigate(redirectMap[user.role]);
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
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm mx-auto mb-6 border border-white/20">
            <Truck className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">ShipAmaze</h1>
          <p className="text-lg text-white/70 mb-8">Logistics and marketplace operations</p>
        </div>
      </div>

      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[420px] animate-fade-in-up">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-3">
              <Truck className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary">ShipAmaze</h1>
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
              <Label htmlFor="password">Password</Label>
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
