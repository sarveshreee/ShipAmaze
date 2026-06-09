import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { LOGO_CARD, LOGO_DARK, LOGO_LIGHT } from "@/lib/brandAssets";

/** Where the logo is rendered — controls asset + sizing. */
export type LogoPlacement = "sidebar" | "header" | "marketplace" | "auth-hero" | "auth-form" | "loading";

const placementClasses: Record<LogoPlacement, string> = {
  /** Location #1 — sidebar brand card, background preserved */
  sidebar: "h-12 w-auto max-w-[210px] object-contain",
  /** Location #2 — top navbar beside hamburger */
  header: "h-8 w-auto max-w-[260px] sm:h-9 sm:max-w-[300px] md:max-w-[340px] object-contain object-left",
  /** Location #3 — marketplace sub-header */
  marketplace: "h-7 w-auto max-w-[220px] sm:h-8 sm:max-w-[280px] md:max-w-[320px] object-contain object-left",
  "auth-hero": "h-20 w-auto max-w-[360px] sm:h-24 sm:max-w-[420px] object-contain",
  "auth-form": "h-14 w-auto max-w-[280px] object-contain",
  loading: "h-14 w-auto max-w-[280px] object-contain",
};

interface ShipAmazeLogoProps {
  placement?: LogoPlacement;
  className?: string;
  alt?: string;
}

export function ShipAmazeLogo({
  placement = "header",
  className,
  alt = "ShipAmaze",
}: ShipAmazeLogoProps) {
  const { theme } = useTheme();

  if (placement === "sidebar") {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
          className,
        )}
      >
        <img
          src={LOGO_CARD}
          alt={alt}
          className={placementClasses.sidebar}
          decoding="async"
          draggable={false}
        />
      </div>
    );
  }

  const useDarkLogo =
    placement === "auth-hero" ||
    (theme === "dark" && (placement === "header" || placement === "marketplace"));

  const src = useDarkLogo ? LOGO_DARK : LOGO_LIGHT;
  const imgClass = placementClasses[placement];

  return (
    <img
      src={src}
      alt={alt}
      className={cn("select-none", imgClass, className)}
      decoding="async"
      draggable={false}
    />
  );
}
