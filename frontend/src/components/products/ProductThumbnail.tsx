import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import * as productService from "@/services/productService";

type Props = {
  productId: string;
  images?: string[];
  hasImage?: boolean;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "auto" | "low";
  fallbackClassName?: string;
};

function directImageUrl(images?: string[]): string | null {
  const raw = images?.[0];
  if (!raw || typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  return url.length <= 512 ? url : null;
}

export function ProductThumbnail({
  productId,
  images,
  hasImage,
  alt,
  className,
  loading = "lazy",
  fetchPriority = "auto",
  fallbackClassName,
}: Props) {
  const inline = directImageUrl(images);
  const [src, setSrc] = useState<string | null>(inline);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (inline) {
      setSrc(inline);
      setFailed(false);
      return;
    }
    if (!hasImage && (!images || images.length === 0)) {
      setSrc(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    void productService.getProductThumbnail(productId).then((url) => {
      if (cancelled) return;
      setSrc(url);
      if (!url) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [productId, inline, hasImage, images]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={cn("flex items-center justify-center bg-surface-2", fallbackClassName ?? className)}>
      <Package className="h-10 w-10 text-text-muted" />
    </div>
  );
}
