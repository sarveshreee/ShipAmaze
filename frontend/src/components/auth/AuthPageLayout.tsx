import type { ReactNode } from "react";
import { ShipAmazeLogo } from "@/components/brand/ShipAmazeLogo";
import { AuthModeSwitch } from "@/components/auth/AuthModeSwitch";

export type AuthHeroVariant = "login" | "signup";

interface AuthPageLayoutProps {
  heroImage: string;
  heroAlt: string;
  variant: AuthHeroVariant;
  children: ReactNode;
}

const HERO_BG: Record<AuthHeroVariant, string> = {
  login: "#faf7f4",
  signup: "#faf7f4",
};

/** Split auth shell: hero image (left) + form panel (right), orange theme via `.auth-page`. */
export function AuthPageLayout({ heroImage, heroAlt, variant, children }: AuthPageLayoutProps) {
  return (
    <div className="auth-page relative flex min-h-screen flex-col overflow-hidden lg:flex-row">
      {/* Hero — left on desktop */}
      <div
        className="relative order-1 h-44 w-full shrink-0 overflow-hidden sm:h-52 lg:h-auto lg:min-h-screen lg:w-[60%]"
        style={{ backgroundColor: HERO_BG[variant] }}
      >
        <img
          src={heroImage}
          alt={heroAlt}
          width={2492}
          height={1696}
          className="auth-hero-img h-full w-full object-cover object-left lg:absolute lg:inset-0 lg:object-[left_center]"
          decoding="async"
          fetchPriority="high"
        />

        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-16 lg:block"
          style={{ background: "linear-gradient(to left, hsl(33 100% 98%), transparent)" }}
          aria-hidden
        />
      </div>

      {/* Form — right on desktop */}
      <div className="relative z-10 order-2 flex w-full shrink-0 flex-col lg:w-[40%]">
        <AuthModeSwitch variant={variant} className="absolute right-5 top-5 z-20 sm:right-8 sm:top-7" />

        <div
          className="pointer-events-none absolute -right-16 top-0 hidden h-72 w-72 rounded-full opacity-40 blur-3xl lg:block"
          style={{ background: "hsl(24 100% 50% / 0.12)" }}
          aria-hidden
        />

        <div className="flex flex-1 items-center justify-center px-6 pb-8 pt-14 sm:px-10 sm:pt-8 lg:py-12">
          <div className="auth-form-card w-full max-w-[420px]">
            <div className="mb-8 flex flex-col items-center lg:items-start">
              <ShipAmazeLogo placement="auth-form" className="auth-form-logo mb-1" />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
