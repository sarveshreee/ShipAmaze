import { cn } from "@/lib/utils";
import { LOGO_CARD } from "@/lib/brandAssets";

/**
 * Top sidebar header branding only (above MARKETPLACE nav).
 * Uses the original logo image with its background — no transparency or theme variants.
 */
export function SidebarHeaderBrand({ className }: { className?: string }) {
  return (
    <img
      src={LOGO_CARD}
      alt="ShipAmaze"
      className={cn(
        "block h-[52px] w-auto max-w-[calc(100%-0.5rem)] object-contain object-left",
        className,
      )}
      decoding="async"
      draggable={false}
    />
  );
}
