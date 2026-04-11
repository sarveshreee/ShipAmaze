import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "admin" | "vendor" | "dropshipper";
const roles: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "vendor", label: "Vendor" },
  { value: "dropshipper", label: "Dropshipper" },
];

export default function SignupPage() {
  const [role, setRole] = useState<Role>("dropshipper");
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "linear-gradient(135deg, hsl(var(--color-primary-dark)), hsl(var(--color-tertiary-dark)))" }}>
      <div className="w-full max-w-[440px] rounded-xl bg-card p-8 shadow-card-lg animate-fade-in-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-3">
            <Package className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">ShipFlow</h1>
          <p className="text-sm text-text-muted">Create your account</p>
        </div>

        <form onSubmit={e => { e.preventDefault(); navigate("/login"); }} className="space-y-3">
          <div><Label>Full Name</Label><Input placeholder="Amit Sharma" /></div>
          <div><Label>Email</Label><Input type="email" placeholder="amit@example.com" /></div>
          <div><Label>Phone</Label><Input placeholder="+91 98000 00000" /></div>
          <div><Label>Business Name</Label><Input placeholder="Your business name" /></div>
          <div><Label>Password</Label><Input type="password" placeholder="••••••••" /></div>
          <div><Label>Confirm Password</Label><Input type="password" placeholder="••••••••" /></div>

          <div>
            <Label className="mb-2 block">Register as</Label>
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

          <label className="flex items-start gap-2 text-xs text-text-secondary">
            <input type="checkbox" className="mt-0.5 rounded border-border" />
            I agree to the Terms of Service and Privacy Policy
          </label>

          <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary-dark">Create Account</Button>
        </form>

        <p className="mt-4 text-center text-sm text-text-secondary">
          Already have an account? <a href="/login" className="text-primary font-medium hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
