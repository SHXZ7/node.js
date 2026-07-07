import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchMonitor, type Update } from "@/lib/news.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Plus, RefreshCw, Radio, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

type Config = {
  country: string;
  topics: string[];
  sources: string[];
  competitors: string[];
};

const DEFAULT: Config = {
  country: "India",
  topics: ["inflation", "RBI monetary policy", "GDP growth", "trade deficit"],
  sources: ["reuters.com", "bloomberg.com", "livemint.com"],
  competitors: ["China economy", "Bangladesh economy"],
};

const STORAGE_KEY = "econpulse.config.v1";

function loadConfig(): Config {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

function Index() {
  const [config, setConfig] = useState<Config>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config, hydrated]);

  const monitor = useMutation({
    mutationFn: () => fetchMonitor({ data: config }),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">EconPulse</h1>
              <p className="text-xs text-muted-foreground">AI monitoring agent for country economics</p>
            </div>
          </div>
          <Button
            onClick={() => monitor.mutate()}
            disabled={monitor.isPending}
            className="gap-2"
          >
            {monitor.isPending ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Scanning…</>
            ) : (
              <><Radio className="h-4 w-4" /> Run scan</>
            )}
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <Card className="space-y-4 border-border bg-card p-5">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Country
              </label>
              <Input
                value={config.country}
                onChange={(e) => setConfig((c) => ({ ...c, country: e.target.value }))}
                className="mt-1"
                placeholder="e.g. India"
              />
            </div>
            <TagEditor
              label="Topics"
              items={config.topics}
              onChange={(topics) => setConfig((c) => ({ ...c, topics }))}
              placeholder="e.g. inflation"
            />
            <TagEditor
              label="Sources"
              items={config.sources}
              onChange={(sources) => setConfig((c) => ({ ...c, sources }))}
              placeholder="e.g. reuters.com"
            />
            <TagEditor
              label="Competitors"
              items={config.competitors}
              onChange={(competitors) => setConfig((c) => ({ ...c, competitors }))}
              placeholder="e.g. China economy"
            />
          </Card>
          <p className="px-1 text-xs text-muted-foreground">
            Config is saved locally. Sources use Google News (site: filter).
          </p>
        </aside>

        <section className="space-y-4">
          {monitor.isIdle && !monitor.data && (
            <EmptyState />
          )}
          {monitor.isError && (
            <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
              Scan failed: {(monitor.error as Error).message}
            </Card>
          )}
          {monitor.isPending && <SkeletonList />}
          {monitor.data && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {monitor.data.updates.length} meaningful update{monitor.data.updates.length === 1 ? "" : "s"}
                  {" · "}
                  <span className="text-muted-foreground/70">
                    filtered from {monitor.data.rawCount} raw items
                  </span>
                </h2>
              </div>
              {monitor.data.updates.length === 0 ? (
                <Card className="p-6 text-sm text-muted-foreground">
                  No meaningful updates surfaced in the last scan. Try adjusting topics or sources.
                </Card>
              ) : (
                <div className="space-y-3">
                  {monitor.data.updates.map((u, i) => (
                    <UpdateCard key={i} u={u} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function TagEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span
            key={it}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground"
          >
            {it}
            <button
              onClick={() => onChange(items.filter((x) => x !== it))}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${it}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="secondary" onClick={add} className="h-8 px-2">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function UpdateCard({ u }: { u: Update }) {
  const importanceColor =
    u.importance === "high"
      ? "bg-[var(--importance-high)]/20 text-[var(--importance-high)] border-[var(--importance-high)]/30"
      : u.importance === "medium"
      ? "bg-[var(--importance-medium)]/20 text-[var(--importance-medium)] border-[var(--importance-medium)]/30"
      : "bg-[var(--importance-low)]/20 text-[var(--importance-low)] border-[var(--importance-low)]/30";
  return (
    <a href={u.link} target="_blank" rel="noreferrer">
      <Card className="group border-border bg-card p-5 transition-colors hover:border-primary/50">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge className={`border ${importanceColor} uppercase tracking-wider`}>
            {u.importance}
          </Badge>
          <Badge variant="outline" className="border-border text-muted-foreground">
            {u.category}
          </Badge>
          <span className="text-muted-foreground/70">·</span>
          <span className="text-muted-foreground">{u.source}</span>
          {u.pubDate && (
            <>
              <span className="text-muted-foreground/70">·</span>
              <span className="text-muted-foreground">
                {new Date(u.pubDate).toLocaleDateString()}
              </span>
            </>
          )}
        </div>
        <h3 className="text-base font-semibold leading-snug group-hover:text-primary">
          {u.headline}
        </h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{u.summary}</p>
        <p className="mt-2 text-xs text-muted-foreground/70">
          Tracked via <span className="text-foreground/70">{u.bucket}</span>: {u.query}
        </p>
      </Card>
    </a>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 border-dashed border-border bg-card/40 p-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary">
        <Radio className="h-5 w-5 text-primary" />
      </div>
      <h2 className="text-lg font-semibold">Ready to scan</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        The agent will pull the latest Google News items for your topics, sources, and competitors,
        then use AI to filter noise and structure meaningful updates.
      </p>
    </Card>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="animate-pulse border-border bg-card p-5">
          <div className="mb-3 h-3 w-40 rounded bg-muted" />
          <div className="mb-2 h-4 w-3/4 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted" />
        </Card>
      ))}
    </div>
  );
}
