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
  "auth-form": "h-20 w-auto max-w-[min(100%,520px)] sm:h-24 md:h-28 lg:h-32 object-contain object-left",
  loading: "h-14 w-auto max-w-[280px] object-contain",
  sidebar: "h-full w-[160%] max-w-none object-cover object-left",
};

function SidebarBrandMark({ decorative }: { decorative?: boolean }) {
  return (
    <div className="sidebar-brand__mark flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#faf8f5] p-1 shadow-md ring-1 ring-white/25">
      <img
        src={LOGO_CARD}
        alt={decorative ? "" : "ShipAmaze"}
        width={480}
        height={140}
        className={placementClasses.sidebar}
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
export function SidebarBrand({ showText = true, className }: { showText?: boolean; className?: string }) {
  return (
    <div className={cn("sidebar-brand flex min-w-0 items-center gap-3", className)}>
      <SidebarBrandMark decorative={showText} />
      {showText ? (
        <span className="sidebar-brand__name whitespace-nowrap text-[17px] font-bold leading-tight tracking-tight text-white">
          ShipAmaze
        </span>
      ) : null}
    </div>
  );
}
