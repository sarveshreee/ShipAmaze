/** Resolve API-hosted media paths to absolute URLs for <img> tags. */
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

export function resolveSrcSet(srcset: string | null | undefined): string | undefined {
  if (!srcset?.trim()) return undefined;
  return srcset
    .split(",")
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
