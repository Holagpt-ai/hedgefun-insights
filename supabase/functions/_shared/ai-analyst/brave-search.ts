export interface BraveWebHit {
  title: string;
  url: string;
  snippet?: string | null;
  age?: string | null;
}

export async function runBraveWebSearch(query: string, count = 5): Promise<BraveWebHit[]> {
  const apiKey = Deno.env.get("BRAVE_API_KEY");
  if (!apiKey || !query.trim()) return [];

  const endpoint =
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&search_lang=en`;
  const res = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!res.ok) {
    console.error("[brave-search] status", res.status, query);
    return [];
  }
  const json = await res.json();
  const hits = json?.web?.results ?? [];
  return hits.map((r: { title?: string; url?: string; description?: string; age?: string }) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? null,
    age: r.age ?? null,
  }));
}
