import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "admin" | "vendor" | "dropshipper";

const roles: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "vendor", label: "Vendor" },
  { value: "dropshipper", label: "Dropshipper" },
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
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(role);
    navigate(redirectMap[role]);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "linear-gradient(135deg, hsl(var(--color-primary-dark)), hsl(var(--color-tertiary-dark)))" }}>
      <div className="w-full max-w-[440px] rounded-xl bg-card p-8 shadow-card-lg animate-fade-in-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-3">
            <Package className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">ShipFlow</h1>
          <p className="text-sm text-text-muted">India's smartest logistics platform</p>
        </div>

        <h2 className="mb-4 text-lg font-semibold text-text-primary text-center">Sign in to your account</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@shipflow.in" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-1 text-right">
              <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Login as</Label>
            <div className="flex gap-2">
              {roles.map(r => (
                <button key={r.value} type="button" onClick={() => setRole(r.value)}
                  className={cn("flex-1 rounded-lg py-2 text-sm font-medium transition-colors border",
                    role === r.value ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 text-text-secondary border-transparent hover:border-border"
                  )}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary-dark">Sign In</Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-text-muted">or continue with</span></div>
          </div>

          <Button type="button" variant="outline" className="w-full">
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Google
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-text-secondary">
          Don't have an account? <a href="/signup" className="text-primary font-medium hover:underline">Sign up</a>
        </p>

        <div className="mt-6 rounded-lg bg-surface-2 p-3 text-xs text-text-muted space-y-1">
          <p className="font-medium text-text-secondary">Demo credentials:</p>
          <p>Admin: admin@shipflow.in / admin123</p>
          <p>Vendor: vendor@shipflow.in / vendor123</p>
          <p>Dropshipper: seller@shipflow.in / seller123</p>
        </div>
      </div>
    </div>
  );
}
