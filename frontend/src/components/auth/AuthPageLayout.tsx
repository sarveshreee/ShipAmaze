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
  const isSignup = variant === "signup";

  return (
    <div
      data-variant={variant}
      className="auth-page relative flex min-h-screen flex-col overflow-x-hidden lg:h-screen lg:max-h-screen lg:overflow-hidden lg:flex-row"
    >
      {/* Hero — left on desktop */}
      <div
        className="relative order-1 h-36 w-full shrink-0 overflow-hidden sm:h-44 md:h-48 lg:h-full lg:w-[60%]"
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
      <div className="relative z-10 order-2 flex w-full min-w-0 shrink-0 flex-col lg:h-full lg:w-[40%] lg:overflow-hidden">
        <AuthModeSwitch variant={variant} className="absolute right-4 top-4 z-20 sm:right-8 sm:top-7" />

        <div
          className="pointer-events-none absolute -right-16 top-0 hidden h-72 w-72 rounded-full opacity-40 blur-3xl lg:block"
          style={{ background: "hsl(24 100% 50% / 0.12)" }}
          aria-hidden
        />

        <div
          className={
            isSignup
              ? "flex flex-1 items-start justify-center overflow-x-hidden px-4 pb-4 pt-14 sm:items-center sm:px-6 sm:pt-8 lg:items-center lg:px-8 lg:py-3"
              : "flex flex-1 items-start justify-center overflow-x-hidden px-4 pb-8 pt-14 sm:items-center sm:px-6 sm:pt-8 lg:px-10 lg:py-10"
          }
        >
          <div
            className={
              isSignup
                ? "auth-form-card w-full min-w-0 max-w-full sm:max-w-[480px] lg:max-w-[520px]"
                : "auth-form-card w-full min-w-0 max-w-full sm:max-w-[480px] lg:max-w-[540px]"
            }
          >
            <div className="mb-4 flex flex-col items-center sm:mb-5 lg:mb-5 lg:items-start">
              <ShipAmazeLogo placement="auth-form" className="auth-form-logo mb-0" />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
