import { useEffect, useRef, useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PRODUCT_IMAGE,
  RESPONSIVE_IMAGE_SIZES,
  resolveMediaUrl,
  resolveSrcSet,
  buildInlineSrcSet,
} from "@/lib/mediaUrl";
import { useInViewport } from "@/hooks/useInViewport";
import * as productService from "@/services/productService";
import type { ProductImageMeta } from "@/services/productService";

type Props = {
  productId: string;
  images?: string[];
  hasImage?: boolean;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "auto" | "low";
  fallbackClassName?: string;
  imageIndex?: number;
  sizes?: string;
};

function directImageUrl(images?: string[]): string | null {
  const raw = images?.[0];
  if (!raw || typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url) return null;
  // Stored optimized paths (/media/products/...) must go through the public
  // image route so Helmet/CORP does not block them cross-origin in dev.
  if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.includes("/products/image/")) {
    return url;
  }
  return url.length <= 512 ? url : null;
}

function inlineMetaFromUrl(url: string): ProductImageMeta {
  const srcset = buildInlineSrcSet(url);
  const thumb = url.includes("/products/image/")
    ? url.replace(/800\.webp(\?.*)?$/, "thumb.webp?v=2")
    : url.includes("/media/products/")
      ? url.replace(/800\.webp(\?.*)?$/, "thumb.webp?v=2")
      : url;
  return {
    url,
    thumb,
    srcset,
    sizes: RESPONSIVE_IMAGE_SIZES,
    width: 800,
    height: 800,
    blurPlaceholder: null,
  };
}

function publicImageMeta(productId: string, imageIndex: number): ProductImageMeta {
  return inlineMetaFromUrl(`/products/image/${productId}/${imageIndex}/800.webp?v=2`);
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
  imageIndex = 0,
  sizes = RESPONSIVE_IMAGE_SIZES,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observeViewport = loading === "lazy" && fetchPriority !== "high";
  const inView = useInViewport(containerRef, { enabled: observeViewport });
  const shouldLoad = !observeViewport || inView;

  const inline = directImageUrl(images);
  const initialMeta = inline ? inlineMetaFromUrl(inline) : hasImage ? publicImageMeta(productId, imageIndex) : null;
  const [meta, setMeta] = useState<ProductImageMeta | null>(initialMeta);
  const [loaded, setLoaded] = useState(Boolean(initialMeta));
  const [failed, setFailed] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState(false);

  useEffect(() => {
    setLoaded(Boolean(inline || hasImage));
    setFailed(false);
    if (inline) {
      setMeta(inlineMetaFromUrl(inline));
      setFetchingMeta(false);
      return;
    }
    if (!hasImage && (!images || images.length === 0)) {
      setMeta(null);
      setFetchingMeta(false);
      return;
    }
    if (!shouldLoad) {
      setMeta(null);
      setFetchingMeta(false);
      return;
    }

    let cancelled = false;
    setMeta(publicImageMeta(productId, imageIndex));
    setFetchingMeta(true);
    void productService.getProductImageMeta(productId, imageIndex).then((data) => {
      if (cancelled) return;
      setFetchingMeta(false);
      // If the small metadata request fails, still try the public image route.
      // This prevents stale metadata failures from hiding valid product images.
      setMeta(data?.url ? data : publicImageMeta(productId, imageIndex));
    });
    return () => {
      cancelled = true;
    };
  }, [productId, inline, hasImage, images, shouldLoad, imageIndex]);

  const resolvedSrc = resolveMediaUrl(meta?.url);
  const resolvedSrcSet = resolveSrcSet(meta?.srcset ?? undefined);
  const width = meta?.width && meta.width > 0 ? meta.width : 800;
  const height = meta?.height && meta.height > 0 ? meta.height : 800;
  const noImage = !hasImage && (!images || images.length === 0) && !inline;

  if (noImage) {
    return (
      <div ref={containerRef} className={cn("flex items-center justify-center bg-surface-2", fallbackClassName ?? className)}>
        <Package className="h-10 w-10 text-text-muted" />
      </div>
    );
  }

  if (!shouldLoad) {
    return (
      <div ref={containerRef} className={cn("relative", fallbackClassName ?? className)}>
        <div className="absolute inset-0 animate-pulse bg-muted/60" />
      </div>
    );
  }

  if (fetchingMeta || (!resolvedSrc && !failed)) {
    return (
      <div ref={containerRef} className={cn("relative", fallbackClassName ?? className)}>
        <div className="absolute inset-0 animate-pulse bg-muted/60" />
      </div>
    );
  }

  if (failed || !resolvedSrc) {
    return (
      <div ref={containerRef} className={cn("flex items-center justify-center bg-surface-2", fallbackClassName ?? className)}>
        <Package className="h-10 w-10 text-text-muted" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {!loaded && (
        <div
          className={cn("absolute inset-0 animate-pulse bg-muted/50", fallbackClassName ?? className)}
          aria-hidden
          style={
            meta?.blurPlaceholder
              ? {
                  backgroundImage: `url(${meta.blurPlaceholder})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "blur(12px)",
                  transform: "scale(1.05)",
                }
              : undefined
          }
        />
      )}
      <img
        src={resolvedSrc!}
        srcSet={resolvedSrcSet}
        sizes={meta?.sizes ?? sizes}
        alt={alt}
        className={cn(className, "transition-opacity duration-300", !loaded && "opacity-0")}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
        }}
      />
    </div>
  );
}

export function ProductImageGallery({
  productId,
  images,
  alt,
  activeIndex,
  onSelect,
}: {
  productId: string;
  images: string[];
  alt: string;
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const hasImages = images.length > 0;

  if (!hasImages) {
    return (
      <div className="aspect-square rounded-xl overflow-hidden bg-muted">
        <img src={DEFAULT_PRODUCT_IMAGE} alt={alt} className="h-full w-full object-cover" width={800} height={800} loading="eager" />
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:flex flex-col gap-2 max-h-[500px] overflow-y-auto">
        {images.map((src, i) => (
          <button
            key={`${productId}-thumb-${i}`}
            type="button"
            onClick={() => onSelect(i)}
            className={`h-20 w-20 rounded-lg overflow-hidden border-2 shrink-0 ${activeIndex === i ? "border-primary" : "border-transparent"}`}
          >
            <ProductThumbnail
              productId={productId}
              images={[src]}
              hasImage
              alt={`${alt} thumbnail ${i + 1}`}
              className="h-full w-full object-cover"
              fallbackClassName="h-full w-full"
              loading="lazy"
              imageIndex={i}
            />
          </button>
        ))}
      </div>

      <div className="aspect-square rounded-xl overflow-hidden bg-muted">
        <ProductThumbnail
          productId={productId}
          images={[images[activeIndex] ?? images[0]]}
          hasImage
          alt={alt}
          className="h-full w-full object-cover"
          fallbackClassName="h-full w-full"
          loading={activeIndex === 0 ? "eager" : "lazy"}
          fetchPriority={activeIndex === 0 ? "high" : "auto"}
          imageIndex={activeIndex}
        />
      </div>
    </>
  );
}
