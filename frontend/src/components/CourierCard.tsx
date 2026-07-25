import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveCourierBrand } from "@/lib/courierLogos";
import { Check } from "lucide-react";
import { providerDisplayName } from "@/services/courierDiscoveryService";

type Props = {
  carrierId: string;
  carrierName: string;
  /** velocity | lorrigo — shown as a small label under the name */
  provider?: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
};

export function CourierCard({
  carrierId,
  carrierName,
  provider,
  selected = false,
  onClick,
  disabled = false,
  compact = false,
}: Props) {
  const brand = resolveCourierBrand(carrierName);
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(brand.logo) && !logoFailed;

  useEffect(() => {
    setLogoFailed(false);
  }, [carrierName, brand.logo]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative flex flex-col items-center justify-center rounded-xl border-2 bg-card text-left transition-all",
        compact ? "p-3 min-h-[100px]" : "p-4 min-h-[120px]",
        selected
          ? "border-primary shadow-lg shadow-primary/20 ring-2 ring-primary/30 bg-primary/[0.04]"
          : "border-border/60 hover:border-primary/40 hover:shadow-md hover:bg-primary/[0.03]",
        disabled && "opacity-50 cursor-not-allowed hover:border-border/60 hover:shadow-none"
      )}
      data-carrier-id={carrierId}
    >
      {selected && (
        <span className="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
          <Check className="h-3 w-3" />
        </span>
      )}

      <div
        className={cn(
          "flex items-center justify-center rounded-lg bg-white border border-border/40 overflow-hidden shrink-0",
          compact ? "h-10 w-[88px] mb-2" : "h-12 w-[104px] mb-3"
        )}
      >
        {showLogo ? (
          <img
            src={brand.logo}
            alt=""
            className="h-full w-full object-contain p-1.5"
            loading="lazy"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span
            className={cn("font-bold", compact ? "text-xs" : "text-sm")}
            style={{ color: brand.color }}
            aria-hidden
          >
            {brand.initials}
          </span>
        )}
      </div>

      <span
        className={cn(
          "font-semibold text-text-primary text-center leading-tight px-1",
          compact ? "text-[10px] line-clamp-2" : "text-xs line-clamp-2"
        )}
      >
        {carrierName}
      </span>
      {provider ? (
        <span
          className={cn(
            "mt-1 text-text-muted uppercase tracking-wide",
            compact ? "text-[9px]" : "text-[10px]"
          )}
        >
          {providerDisplayName(provider)}
        </span>
      ) : null}
    </button>
  );
}
