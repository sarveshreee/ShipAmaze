import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type ProductLine = {
  name?: string;
  productName?: string;
  sku?: string;
  qty?: number;
};

function displayName(p: ProductLine): string {
  return String(p.name ?? p.productName ?? "").trim() || "—";
}

function displaySku(p: ProductLine, index: number): string {
  const sku = String(p.sku ?? "").trim();
  return sku || `SKU-${index + 1}`;
}

type ProductLineDisplayProps = {
  product: ProductLine;
  index?: number;
  showQty?: boolean;
  className?: string;
  compact?: boolean;
};

export function ProductLineDisplay({
  product,
  index = 0,
  showQty = true,
  className,
  compact = false,
}: ProductLineDisplayProps) {
  const [copied, setCopied] = useState(false);
  const name = displayName(product);
  const sku = displaySku(product, index);
  const hasRealSku = Boolean(String(product.sku ?? "").trim());

  const copySku = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(sku);
      setCopied(true);
      toast.success("SKU copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy SKU");
    }
  };

  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={cn(
          "font-medium text-text-primary leading-snug",
          compact ? "text-[11px] line-clamp-2" : "text-sm line-clamp-2"
        )}
        title={name}
      >
        {name}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono",
            hasRealSku
              ? "border-border/80 bg-surface-2/80 text-text-muted"
              : "border-amber-200/80 bg-amber-50/80 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
            compact ? "text-[10px]" : "text-[11px]"
          )}
        >
          <span className="opacity-70">SKU</span>
          <span className="max-w-[120px] sm:max-w-[180px] truncate" title={sku}>
            {sku}
          </span>
          <button
            type="button"
            onClick={copySku}
            className="shrink-0 rounded p-0.5 hover:bg-primary/10 hover:text-primary transition-colors"
            aria-label="Copy SKU"
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          </button>
        </span>
        {showQty && product.qty != null ? (
          <span className={cn("text-text-muted", compact ? "text-[10px]" : "text-[11px]")}>
            Qty {product.qty}
          </span>
        ) : null}
      </div>
    </div>
  );
}
