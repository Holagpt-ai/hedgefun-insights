declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function RouteChangeTracker() {
  const location = useLocation();
  useEffect(() => {
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);
  return null;
}
