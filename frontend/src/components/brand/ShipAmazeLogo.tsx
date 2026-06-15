import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { LOGO_CARD, LOGO_DARK, LOGO_LIGHT } from "@/lib/brandAssets";

/** Where the logo is rendered — controls asset + sizing. */
export type LogoPlacement = "sidebar" | "header" | "marketplace" | "auth-hero" | "auth-form" | "loading";

const placementClasses: Record<LogoPlacement, string> = {
  /** Location #2 — top navbar beside hamburger */
  header: "h-8 w-auto max-w-[260px] sm:h-9 sm:max-w-[300px] md:max-w-[340px] object-contain object-left",
  /** Location #3 — marketplace sub-header */
  marketplace: "h-7 w-auto max-w-[220px] sm:h-8 sm:max-w-[280px] md:max-w-[320px] object-contain object-left",
  "auth-hero": "h-20 w-auto max-w-[360px] sm:h-24 sm:max-w-[420px] object-contain",
  "auth-form": "h-[72px] w-auto max-w-[min(100%,420px)] sm:h-20 md:h-24 object-contain",
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
      <img
        src={LOGO_CARD}
        alt={alt}
        className={cn("h-10 w-10 shrink-0 rounded-md object-contain", className)}
        decoding="async"
        draggable={false}
      />
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
      width={placement === "auth-form" ? 500 : undefined}
      height={placement === "auth-form" ? 500 : undefined}
      className={cn("select-none", imgClass, className)}
      decoding="async"
      fetchPriority={placement === "auth-form" ? "high" : undefined}
      draggable={false}
    />
  );
}

/** Sidebar header: [Logo] ShipAmaze — logo with background + brand text when expanded. */
export function SidebarBrand({ showText = true, className }: { showText?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <ShipAmazeLogo placement="sidebar" />
      {showText && (
        <span className="truncate text-[15px] font-semibold tracking-tight text-slate-50 dark:text-white">
          ShipAmaze
        </span>
      )}
    </div>
  );
}
