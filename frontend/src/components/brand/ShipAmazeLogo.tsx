import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { LOGO_DARK, LOGO_LIGHT, LOGO_SIDEBAR_MARK } from "@/lib/brandAssets";

/** Where the logo is rendered — controls asset + sizing. */
export type LogoPlacement = "sidebar" | "header" | "marketplace" | "auth-hero" | "auth-form" | "loading";

const placementClasses: Record<LogoPlacement, string> = {
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
          "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#faf8f5]",
          className,
        )}
      >
        <img
          src={LOGO_SIDEBAR_MARK}
          alt={alt}
          className="h-full w-full object-contain object-center"
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
