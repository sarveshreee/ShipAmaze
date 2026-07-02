import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { LOGO_CARD, LOGO_DARK, LOGO_LIGHT } from "@/lib/brandAssets";

/** Where the logo is rendered — controls asset + sizing. */
export type LogoPlacement = "sidebar" | "header" | "marketplace" | "auth-hero" | "auth-form" | "loading";

const placementClasses: Record<LogoPlacement, string> = {
  /** Location #2 — top navbar beside hamburger */
  header: "h-11 w-auto max-w-[320px] sm:h-12 sm:max-w-[380px] md:h-14 md:max-w-[440px] object-contain object-left",
  /** Location #3 — marketplace sub-header */
  marketplace: "h-10 w-auto max-w-[300px] sm:h-12 sm:max-w-[360px] md:h-14 md:max-w-[420px] object-contain object-left",
  "auth-hero": "h-20 w-auto max-w-[360px] sm:h-24 sm:max-w-[420px] object-contain",
  "auth-form": "h-20 w-auto max-w-[min(100%,520px)] sm:h-24 md:h-28 lg:h-32 object-contain object-left",
  loading: "h-28 w-auto max-w-[min(92vw,520px)] sm:h-36 sm:max-w-[600px] md:h-40 object-contain drop-shadow-[0_4px_24px_hsl(24_95%_53%/0.15)]",
  sidebar: "h-full w-full max-w-none object-contain object-center",
};

function SidebarBrandMark({ decorative, compact }: { decorative?: boolean; compact?: boolean }) {
  return (
    <div
      className={cn(
        "sidebar-brand__mark flex shrink-0 items-center justify-center overflow-hidden bg-[#faf8f5] shadow-md ring-1 ring-white/25 transition-all duration-300",
        compact
          ? "h-8 w-8 rounded-lg px-0.5 py-0.5"
          : "h-14 w-[5.25rem] rounded-xl px-1.5 py-1",
      )}
    >
      <img
        src={LOGO_CARD}
        alt={decorative ? "" : "ShipAmaze"}
        width={480}
        height={140}
        className={cn(
          "h-full w-full object-contain object-center transition-transform duration-300",
          compact ? "scale-100" : "scale-[1.15]",
        )}
        decoding="async"
        draggable={false}
      />
    </div>
  );
}

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
    return <SidebarBrandMark />;
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
      width={placement === "auth-form" ? 500 : undefined}
      height={placement === "auth-form" ? 500 : undefined}
      className={cn("select-none", imgClass, className)}
      decoding="async"
      fetchPriority={placement === "auth-form" ? "high" : undefined}
      draggable={false}
    />
  );
}

/** Sidebar header — app mark + ShipAmaze wordmark. */
export function SidebarBrand({
  showText = true,
  compact = false,
  className,
}: {
  showText?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("sidebar-brand flex min-w-0 items-center gap-3", className)}>
      <SidebarBrandMark decorative={showText} compact={compact} />
      {showText ? (
        <span className="sidebar-brand__name whitespace-nowrap text-[19px] font-bold leading-tight tracking-tight text-white">
          ShipAmaze
        </span>
      ) : null}
    </div>
  );
}
