import { useEffect } from "react";

interface SeoProps {
  title: string;
  description: string;
  canonical?: string;
  jsonLd?: Record<string, unknown>;
}

/**
 * Sets document title, meta description, canonical link, and JSON-LD structured data.
 * Cleans up on unmount.
 */
export function usePageSeo({ title, description, canonical, jsonLd }: SeoProps) {
  useEffect(() => {
    // Title
    const prevTitle = document.title;
    document.title = title;

    // Meta description
    let metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const prevDesc = metaDesc?.content;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.name = "description";
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;

    // OG tags
    const ogTags: { property: string; content: string }[] = [
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: jsonLd?.["@type"] === "Article" ? "article" : "website" },
    ];
    if (canonical) ogTags.push({ property: "og:url", content: canonical });

    const createdOgElements: HTMLMetaElement[] = [];
    ogTags.forEach(({ property, content }) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
        createdOgElements.push(el);
      }
      el.content = content;
    });

    // Canonical
    let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const prevCanonical = canonicalEl?.href;
    if (canonical) {
      if (!canonicalEl) {
        canonicalEl = document.createElement("link");
        canonicalEl.rel = "canonical";
        document.head.appendChild(canonicalEl);
      }
      canonicalEl.href = canonical;
    }

    // JSON-LD
    let scriptEl: HTMLScriptElement | null = null;
    if (jsonLd) {
      scriptEl = document.createElement("script");
      scriptEl.type = "application/ld+json";
      scriptEl.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(scriptEl);
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== undefined) metaDesc.content = prevDesc;
      if (canonicalEl && prevCanonical !== undefined) canonicalEl.href = prevCanonical;
      if (scriptEl) scriptEl.remove();
      createdOgElements.forEach((el) => el.remove());
    };
  }, [title, description, canonical, jsonLd]);
}
