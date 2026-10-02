import { globeNewswireStockCategories } from "./globenewswire-ticker.ts";
import { canonicalHttpsUrl, toIsoDate, toUtcIso } from "./normalize.ts";

export interface ParsedFeedItem {
  externalId: string | null;
  url: string | null;
  title: string | null;
  summary: string | null;
  publishedAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledDate: string | null;
  metadata: Record<string, unknown>;
}

function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  for (const match of xml.matchAll(re)) {
    if (out.length >= 200) break;
    out.push(match[1] ?? "");
  }
  return out;
}

function tagText(block: string, tag: string): string | null {
  const cdata = block.match(new RegExp(`<${tag}\\b[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i"));
  if (cdata) return decode(cdata[1].trim());
  const plain = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!plain) return null;
  return decode(plain[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function attr(block: string, tag: string, name: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${name}\\s*=\\s*["']([^"']+)["'][^>]*>`, "i");
  const match = block.match(re);
  return match ? decode(match[1]) : null;
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

export function parseRssOrAtom(xml: string): ParsedFeedItem[] {
  const atom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const chunks = atom ? blocks(xml, "entry") : blocks(xml, "item");
  return chunks.map((block) => {
    const title = tagText(block, "title");
    const link = atom ? (attr(block, "link", "href") ?? tagText(block, "link")) : tagText(block, "link");
    const summary = tagText(block, "description") ?? tagText(block, "summary") ?? tagText(block, "content");
    const published = toUtcIso(tagText(block, "published") ?? tagText(block, "updated") ?? tagText(block, "pubDate"));
    const guid = tagText(block, "guid") ?? tagText(block, "id");
    const stockCategories = globeNewswireStockCategories(block);
    return {
      externalId: guid,
      url: canonicalHttpsUrl(link),
      title,
      summary,
      publishedAt: published,
      scheduledStart: null,
      scheduledEnd: null,
      scheduledDate: null,
      metadata: stockCategories.length > 0 ? { provider_stock_categories: stockCategories } : {},
    };
  }).filter((item) => item.title);
}

export function parseJsonItems(body: string): ParsedFeedItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)
    ? (parsed as { items: unknown[] }).items
    : [];
  const out: ParsedFeedItem[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title : typeof item.name === "string" ? item.name : null;
    if (!title) continue;
    const startRaw = typeof item.start === "string" ? item.start : typeof item.startDate === "string" ? item.startDate : null;
    const endRaw = typeof item.end === "string" ? item.end : typeof item.endDate === "string" ? item.endDate : null;
    out.push({
      externalId: typeof item.id === "string" ? item.id : null,
      url: canonicalHttpsUrl(item.url ?? item.link),
      title,
      summary: typeof item.summary === "string" ? item.summary : typeof item.description === "string" ? item.description : null,
      publishedAt: toUtcIso(item.published_at ?? item.publishedAt ?? item.date),
      scheduledStart: startRaw && startRaw.length > 10 ? toUtcIso(startRaw) : null,
      scheduledEnd: endRaw && endRaw.length > 10 ? toUtcIso(endRaw) : null,
      scheduledDate: startRaw ? toIsoDate(startRaw.slice(0, 10)) : null,
      metadata: typeof item.ticker === "string" ? { ticker: item.ticker } : {},
    });
  }
  return out;
}

export function parseHtmlArticles(html: string): ParsedFeedItem[] {
  const chunks = blocks(html, "article");
  const out: ParsedFeedItem[] = [];
  for (const block of chunks) {
    const title = tagText(block, "h2") ?? tagText(block, "h1") ?? tagText(block, "h3");
    const href = attr(block, "a", "href");
    const when = attr(block, "time", "datetime");
    const summary = tagText(block, "p");
    if (!title) continue;
    out.push({
      externalId: href,
      url: canonicalHttpsUrl(href),
      title,
      summary,
      publishedAt: toUtcIso(when),
      scheduledStart: null,
      scheduledEnd: null,
      scheduledDate: null,
      metadata: {},
    });
  }
  return out;
}

export function parseJsonLdEvents(body: string): ParsedFeedItem[] {
  const scripts = [...body.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  if (scripts.length === 0 && body.trim().startsWith("{")) scripts.push(body);
  const out: ParsedFeedItem[] = [];
  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script);
    } catch {
      continue;
    }
    collectEvents(parsed, out);
  }
  return out;
}

function collectEvents(node: unknown, out: ParsedFeedItem[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const entry of node) collectEvents(entry, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes("Event")) out.push(eventItem(obj));
  if (Array.isArray(obj["@graph"])) collectEvents(obj["@graph"], out);
}

function eventItem(obj: Record<string, unknown>): ParsedFeedItem {
  const start = typeof obj.startDate === "string" ? obj.startDate : null;
  const end = typeof obj.endDate === "string" ? obj.endDate : null;
  const timed = start != null && /T|\d{2}:\d{2}/.test(start);
  return {
    externalId: typeof obj.url === "string" ? obj.url : typeof obj["@id"] === "string" ? obj["@id"] : null,
    url: canonicalHttpsUrl(obj.url),
    title: typeof obj.name === "string" ? obj.name : null,
    summary: typeof obj.description === "string" ? obj.description : null,
    publishedAt: null,
    scheduledStart: timed ? toUtcIso(start) : null,
    scheduledEnd: end && /T|\d{2}:\d{2}/.test(end) ? toUtcIso(end) : null,
    scheduledDate: start ? toIsoDate(start.slice(0, 10)) : null,
    metadata: {},
  };
}

export function parseIcsEvents(body: string): ParsedFeedItem[] {
  const unfolded = body.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n");
  const chunks = unfolded.split("BEGIN:VEVENT").slice(1).map((part) => part.split("END:VEVENT")[0] ?? "");
  return chunks.map((block) => {
    const lines = new Map<string, string>();
    for (const line of block.split("\n")) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      lines.set(line.slice(0, idx).toUpperCase(), line.slice(idx + 1).trim());
    }
    const start = icsWhen(lines, "DTSTART");
    const end = icsWhen(lines, "DTEND");
    return {
      externalId: lines.get("UID") ?? null,
      url: canonicalHttpsUrl(lines.get("URL")),
      title: lines.get("SUMMARY") ?? null,
      summary: lines.get("DESCRIPTION") ?? null,
      publishedAt: null,
      scheduledStart: start.start,
      scheduledEnd: end.start,
      scheduledDate: start.date,
      metadata: start.timezone ? { timezone: start.timezone } : {},
    };
  });
}

function icsWhen(lines: Map<string, string>, key: string): { start: string | null; date: string | null; timezone: string | null } {
  let rawKey = "";
  let raw = "";
  for (const [name, value] of lines) {
    if (name === key || name.startsWith(`${key};`)) {
      rawKey = name;
      raw = value;
      break;
    }
  }
  if (!raw) return { start: null, date: null, timezone: null };
  const tz = rawKey.match(/TZID=([^;:]+)/i)?.[1] ?? null;
  if (/VALUE=DATE/i.test(rawKey) || /^\d{8}$/.test(raw)) {
    const ymd = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return { start: null, date: toIsoDate(ymd), timezone: tz };
  }
  if (tz && !/[zZ]$/.test(raw) && !/[+-]\d{4}$/.test(raw)) {
    return { start: null, date: null, timezone: tz };
  }
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?$/);
  if (!match) return { start: null, date: null, timezone: tz };
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7] === "Z" || !match[7] ? "Z" : match[7]}`;
  return { start: toUtcIso(iso), date: `${match[1]}-${match[2]}-${match[3]}`, timezone: tz };
}

export function parseSitemap(xml: string): ParsedFeedItem[] {
  return blocks(xml, "url").map((block) => {
    const loc = tagText(block, "loc");
    const lastmod = toUtcIso(tagText(block, "lastmod"));
    const slug = loc ? loc.split("/").filter(Boolean).pop() ?? null : null;
    const title = slug ? decodeURIComponent(slug).replace(/[-_]+/g, " ") : null;
    return {
      externalId: loc,
      url: canonicalHttpsUrl(loc),
      title,
      summary: null,
      publishedAt: lastmod,
      scheduledStart: null,
      scheduledEnd: null,
      scheduledDate: null,
      metadata: { sitemap: true },
    };
  }).filter((item) => item.title && item.url);
}

export function detectFeedFormat(body: string): "rss" | "atom" | "json" | "html" | "jsonld" | "ics" | "sitemap" {
  const head = body.trim().slice(0, 500).toLowerCase();
  if (head.includes("begin:vcalendar")) return "ics";
  if (head.includes("<urlset")) return "sitemap";
  if (head.includes("application/ld+json") || head.includes("\"@type\":\"event\"") || head.includes("\"@type\": \"event\"")) {
    return "jsonld";
  }
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  if (head.includes("<feed")) return "atom";
  if (head.includes("<rss") || head.includes("<item")) return "rss";
  return "html";
}
