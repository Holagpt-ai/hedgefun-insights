import { useEffect } from "react";

/**
 * Sets robots noindex,nofollow on authenticated/private shells; restores on unmount.
 */
export function useRobotsNoIndex(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const created = !meta;
    const prev = meta?.content;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex, nofollow";
    return () => {
      if (!meta) return;
      if (created) meta.remove();
      else if (prev !== undefined) meta.content = prev;
    };
  }, [enabled]);
}
