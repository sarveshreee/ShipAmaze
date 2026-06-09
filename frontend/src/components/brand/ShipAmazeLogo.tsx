import { cn } from "@/lib/utils";
import { BRAND_LOGO, BRAND_LOGO_MARK } from "@/lib/brandAssets";

type LogoSize = "mark" | "compact" | "default" | "large" | "hero";
type LogoVariant = "default" | "onDark";

const sizeClasses: Record<LogoSize, string> = {
  mark: "h-8 w-8",
  compact: "h-8 w-auto max-w-[140px]",
  default: "h-10 w-auto max-w-[180px]",
  large: "h-14 w-auto max-w-[240px]",
  hero: "h-20 w-auto max-w-[320px] sm:h-24 sm:max-w-[380px]",
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
  const src = size === "mark" ? BRAND_LOGO_MARK : BRAND_LOGO;

  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        "object-contain object-left select-none",
        sizeClasses[size],
        variant === "onDark" && "brightness-0 invert",
        className,
      )}
      decoding="async"
      draggable={false}
    />
  );
}
