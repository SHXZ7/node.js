import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const InputSchema = z.object({
  country: z.string().min(1).max(80),
  topics: z.array(z.string().min(1).max(80)).max(20),
  sources: z.array(z.string().min(1).max(120)).max(20),
  competitors: z.array(z.string().min(1).max(120)).max(20),
});

export type MonitorInput = z.infer<typeof InputSchema>;

export interface RawItem {
  title: string;
  link: string;
  pubDate?: string;
  source: string;
  description?: string;
  bucket: "topic" | "source" | "competitor";
  query: string;
}

export interface Update {
  headline: string;
  summary: string;
  category: string;
  importance: "high" | "medium" | "low";
  bucket: "topic" | "source" | "competitor";
  query: string;
  source: string;
  link: string;
  pubDate?: string;
}

type Provider = "google" | "bing" | "yahoo" | "reddit";

const PROVIDERS: Provider[] = ["google", "bing", "yahoo", "reddit"];

function feedUrl(provider: Provider, q: string): string {
  const e = encodeURIComponent(q);
  switch (provider) {
    case "google":
      return `https://news.google.com/rss/search?q=${e}&hl=en-US&gl=US&ceid=US:en`;
    case "bing":
      return `https://www.bing.com/news/search?q=${e}&format=rss`;
    case "yahoo":
      return `https://news.search.yahoo.com/rss?p=${e}`;
    case "reddit":
      return `https://www.reddit.com/search.rss?q=${e}&sort=new`;
  }
}

async function fetchRss(url: string): Promise<Array<Record<string, unknown>>> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 EconMonitor/1.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    const items =
      parsed?.rss?.channel?.item ??
      parsed?.feed?.entry ??
      [];
    return Array.isArray(items) ? items : [items];
  } catch {
    return [];
  }
}

function normalize(
  items: Array<Record<string, unknown>>,
  bucket: RawItem["bucket"],
  query: string,
  provider: Provider,
): RawItem[] {
  return items.slice(0, 8).map((it) => {
    const title = String((it.title as { "#text"?: string })?.["#text"] ?? it.title ?? "").trim();
    const link =
      typeof it.link === "string"
        ? it.link
        : String((it.link as { "@_href"?: string })?.["@_href"] ?? "");
    const description = String(it.description ?? it.summary ?? "").replace(/<[^>]+>/g, "").slice(0, 400);
    let source =
      String((it.source as { "#text"?: string })?.["#text"] ?? "") ||
      String((it.author as { name?: string })?.name ?? "");
    if (!source) {
      try {
        source = new URL(link).hostname.replace(/^www\./, "");
      } catch {
        source = provider;
      }
    }
    return {
      title,
      link,
      pubDate: String(it.pubDate ?? it.published ?? "") || undefined,
      description,
      source: provider === "reddit" ? `reddit · ${source}` : source,
      bucket,
      query,
    };
  });
}

export const fetchMonitor = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const jobs: Array<{ bucket: RawItem["bucket"]; query: string; provider: Provider; url: string }> = [];
    const push = (bucket: RawItem["bucket"], query: string, q: string) => {
      for (const p of PROVIDERS) {
        // Reddit doesn't respect site: — skip it for source-bucket site-filtered queries.
        if (p === "reddit" && bucket === "source") continue;
        jobs.push({ bucket, query, provider: p, url: feedUrl(p, q) });
      }
    };
    for (const t of data.topics) push("topic", t, `${data.country} ${t}`);
    for (const s of data.sources) push("source", s, `${data.country} economy site:${s}`);
    for (const c of data.competitors) push("competitor", c, `${c} ${data.country}`);

    const results = await Promise.all(jobs.map((j) => fetchRss(j.url)));
    const raw: RawItem[] = [];
    const seen = new Set<string>();
    results.forEach((items, i) => {
      for (const n of normalize(items, jobs[i].bucket, jobs[i].query, jobs[i].provider)) {
        const key = n.title.toLowerCase().replace(/\W+/g, " ").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        raw.push(n);
      }
    });

    if (raw.length === 0) return { updates: [] as Update[], rawCount: 0 };

    // Truncate to reasonable size for the model.
    const forModel = raw.slice(0, 80).map((r, i) => ({
      id: i,
      title: r.title,
      description: r.description,
      source: r.source,
      bucket: r.bucket,
      query: r.query,
    }));

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const prompt = `You are an economics news analyst monitoring "${data.country}".

From the raw news items below, filter out noise (clickbait, duplicates, celebrity/entertainment fluff, opinion pieces unrelated to economics or the monitored entities) and identify meaningful updates about the country's economy, policy, markets, or the tracked competitors.

Return a JSON object with a single key "updates" — an array where each item has:
- id (number, matching input id)
- headline (string, rewritten to be clear and neutral, <= 110 chars)
- summary (string, 1-2 sentences, <= 260 chars, explain why it matters)
- category (short string like "Monetary Policy", "Markets", "Trade", "Competitor", "Regulation", "Macro")
- importance ("high" | "medium" | "low")

Only include meaningful items. Drop the rest. Return ONLY valid JSON.

RAW_ITEMS:
${JSON.stringify(forModel)}`;

    const { text } = await generateText({ model, prompt });

    let parsed: { updates: Array<{ id: number; headline: string; summary: string; category: string; importance: "high" | "medium" | "low" }> } = { updates: [] };
    try {
      const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
      parsed = JSON.parse(jsonText);
    } catch {
      parsed = { updates: [] };
    }

    const updates: Update[] = parsed.updates
      .filter((u) => raw[u.id])
      .map((u) => ({
        headline: u.headline,
        summary: u.summary,
        category: u.category,
        importance: u.importance,
        bucket: raw[u.id].bucket,
        query: raw[u.id].query,
        source: raw[u.id].source,
        link: raw[u.id].link,
        pubDate: raw[u.id].pubDate,
      }));

    const order = { high: 0, medium: 1, low: 2 } as const;
    updates.sort((a, b) => order[a.importance] - order[b.importance]);

    return { updates, rawCount: raw.length };
  });