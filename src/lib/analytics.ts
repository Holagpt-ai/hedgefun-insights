declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (window.dataLayer) {
    window.dataLayer.push({ event: eventName, ...params });
  }
  if (window.gtag) {
    window.gtag('event', eventName, params);
  }
}
