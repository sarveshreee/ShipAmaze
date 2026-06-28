import { useEffect, useState, type RefObject } from "react";

type Options = {
  rootMargin?: string;
  threshold?: number;
  enabled?: boolean;
};

export function useInViewport<T extends Element>(
  ref: RefObject<T | null>,
  { rootMargin = "240px", threshold = 0.01, enabled = true }: Options = {}
): boolean {
  const [inView, setInView] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setInView(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, ref, rootMargin, threshold]);

  return inView;
}
