/** Resolve API-hosted media paths to absolute URLs for <img> tags. */
export type ProductImageValue =
  | string
  | {
      publicId?: string;
      public_id?: string;
      secureUrl?: string;
      secure_url?: string;
      url?: string;
      path?: string;
    };

export function productImageUrl(image: ProductImageValue | null | undefined): string | null {
  if (!image) return null;
  if (typeof image === "string") return image.trim() || null;
  return image.secureUrl?.trim()
    || image.secure_url?.trim()
    || image.url?.trim()
    || image.path?.trim()
    || null;
}

export function transformCloudinaryUrl(
  url: string | null | undefined,
  options: { width: number; crop?: "fill" | "limit" }
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/res\.cloudinary\.com\/.+\/image\/upload\//i.test(trimmed)) return trimmed;
  const transform = [`f_auto`, `q_auto`, `w_${options.width}`, options.crop ? `c_${options.crop}` : ""]
    .filter(Boolean)
    .join(",");
  return trimmed.replace(/\/image\/upload\/(?:[^/]+,)*((?:v\d+\/)?)/, `/image/upload/${transform}/$1`);
}

export function productImageDisplayUrl(
  image: ProductImageValue | null | undefined,
  options: { width: number; crop?: "fill" | "limit" }
): string | null {
  return transformCloudinaryUrl(productImageUrl(image), options);
}

export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;

  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const normalized = envBase ? envBase.replace(/\/$/, "") : import.meta.env.DEV ? "http://localhost:5000/api" : "";
  const apiBase = /\/api$/i.test(normalized) ? normalized : normalized ? `${normalized}/api` : "";
  if (!apiBase) return trimmed;

  return `${apiBase}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

/** Split srcset entries without breaking Cloudinary transform commas inside URLs. */
function splitSrcSetEntries(srcset: string): string[] {
  const trimmed = srcset.trim();
  if (!trimmed) return [];
  if (!/res\.cloudinary\.com/i.test(trimmed)) {
    return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return trimmed.split(/,\s+(?=https?:\/\/)/i).map((entry) => entry.trim()).filter(Boolean);
}

export function buildCloudinarySrcSet(
  url: string | null | undefined,
  widths: number[] = [250, 500, 900]
): string | undefined {
  const base = productImageUrl(url);
  if (!base || !/res\.cloudinary\.com/i.test(base)) return undefined;
  const entries = widths
    .map((width) => {
      const transformed = transformCloudinaryUrl(base, { width, crop: width <= 500 ? "fill" : undefined });
      return transformed ? `${transformed} ${width}w` : null;
    })
    .filter((entry): entry is string => Boolean(entry));
  return entries.length ? entries.join(", ") : undefined;
}

export function resolveSrcSet(srcset: string | null | undefined): string | undefined {
  if (!srcset?.trim()) return undefined;
  return splitSrcSetEntries(srcset)
    .map((entry) => {
      const part = entry.trim();
      const space = part.lastIndexOf(" ");
      if (space <= 0) return resolveMediaUrl(part) ?? part;
      const url = part.slice(0, space);
      const descriptor = part.slice(space + 1);
      const resolved = resolveMediaUrl(url);
      return resolved ? `${resolved} ${descriptor}` : part;
    })
    .join(", ");
}

export const DEFAULT_PRODUCT_IMAGE = "/placeholder.svg";
export const RESPONSIVE_IMAGE_SIZES = "(max-width: 480px) 300px, (max-width: 960px) 600px, 800px";

const OPTIMIZED_PATH_RE = /\/media\/products\/([^/]+)\/(\d+)\/(?:800|600|300|thumb)\.webp(?:\?.*)?$/;
const PUBLIC_IMAGE_PATH_RE = /\/products\/image\/([^/]+)\/(\d+)\/(?:800|600|300|thumb)\.webp(?:\?.*)?$/;

export function buildInlineSrcSet(url: string): string | null {
  const mediaMatch = url.match(OPTIMIZED_PATH_RE);
  const publicMatch = url.match(PUBLIC_IMAGE_PATH_RE);
  const match = publicMatch ?? mediaMatch;
  if (!match) return null;
  const [, productId, index] = match;
  const prefix = publicMatch ? "/products/image" : "/media/products";
  return [300, 600, 800]
    .map((width) => `${resolveMediaUrl(`${prefix}/${productId}/${index}/${width}.webp?v=2`)} ${width}w`)
    .join(", ");
}
