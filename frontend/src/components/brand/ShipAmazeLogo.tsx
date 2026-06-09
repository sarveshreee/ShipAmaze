import { cn } from "@/lib/utils";
import { BRAND_LOGO, BRAND_LOGO_MARK, BRAND_LOGO_WITH_BG } from "@/lib/brandAssets";

type LogoSize = "mark" | "compact" | "sidebar" | "default" | "large" | "hero";
type LogoVariant = "default" | "onDark" | "withBackground";

const sizeClasses: Record<LogoSize, string> = {
  mark: "h-8 w-8",
  /** Navbar / mobile header — wide enough to show full ShipAmaze wordmark */
  compact: "h-9 w-auto max-w-[200px] sm:h-10 sm:max-w-[240px]",
  /** Sidebar — full wordmark + tagline visible, cream background preserved */
  sidebar: "h-11 w-auto max-w-[220px]",
  default: "h-10 w-auto max-w-[240px]",
  large: "h-14 w-auto max-w-[280px]",
  hero: "h-20 w-auto max-w-[360px] sm:h-24 sm:max-w-[420px]",
};

interface ShipAmazeLogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
  alt?: string;
}

export function ShipAmazeLogo({
  size = "default",
  variant = "default",
  className,
  alt = "ShipAmaze",
}: ShipAmazeLogoProps) {
  const src =
    size === "mark"
      ? BRAND_LOGO_MARK
      : variant === "withBackground"
        ? BRAND_LOGO_WITH_BG
        : BRAND_LOGO;

  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        "object-contain object-left select-none",
        sizeClasses[size],
        variant === "onDark" && "brightness-0 invert",
        variant === "withBackground" && "rounded-md",
        className,
      )}
      decoding="async"
      draggable={false}
    />
  );
}
