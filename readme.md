# Economics News Monitoring Agent

AI agent that tracks economics news for a target country, filters noise with 
Gemini, and returns structured, prioritized updates.

## Stack
- **Frontend/Backend:** TanStack Start (React 19 + Vite, server functions)
- **AI:** Lovable AI Gateway → `google/gemini-3-flash-preview`
- **Sources:** Google News RSS, Bing News RSS, Yahoo News RSS, Reddit RSS
- **Deployed on:** Lovable (`.lovable.app`)

## Core capabilities (per brief)
1. **Monitor relevant sources** — 4 RSS providers, fanned out in parallel across 
   user-defined topics, sources, and competitors.
2. **Filter noise** — Gemini 3 Flash rewrites headlines, drops clickbait/dupes, 
   scores importance.
3. **Deliver clearly** — structured cards grouped by importance, with category, 
   why-it-matters summary, source, and link.
4. **Configurable** — country, topics, sources, competitors are all user inputs.

## Key design decisions
| Decision | Why |
|---|---|
| RSS over paid APIs | Zero cost, no keys, sufficient recall for a prototype |
| Multi-provider fan-out | Redundancy + broader coverage than any single feed |
| Title-normalized dedup | Cheap pre-LLM filter, saves tokens |
| Gemini 3 Flash | Cheap, fast, great at short structured extraction |
| Server functions (not edge) | Typed RPC, single deploy target, simple |

## Limitations
- No persistence — every scan is stateless
- No scheduling — scans are on-demand
- RSS feeds rate-limit and occasionally return empty
- No semantic dedup across near-duplicate stories
- Single-user, no auth
- Synchronous request (can be slow with many queries)

---

## Further Development Roadmap

### Week 1 — Reliability & data quality
- Add paid API fallback (NewsAPI or GNews) when RSS is empty/rate-limited
- Retry with exponential backoff per provider
- Semantic dedup with embeddings (cluster near-duplicates, keep best)
- Structured output via AI SDK `Output.object` for schema guarantees

### Week 2 — Persistence & scheduling  
- Lovable Cloud (Postgres) — store scans, updates, user configs
- Scheduled scans via pg_cron → hourly/daily digests
- Trend detection (item repeated across N sources = higher importance)
- Historical view: "what changed in the last 24h"

### Week 3 — Delivery channels
- Email digest (Resend) — daily/weekly summary
- Slack/Telegram bot — push high-importance items in real time
- RSS feed of filtered output (meta!)
- Webhook for custom integrations

### Week 4 — Multi-tenant & production polish
- Auth (Lovable Cloud) + per-user configs
- Rate limiting + usage quotas
- Admin dashboard: scan history, cost tracking, source health
- Evaluation harness: labeled dataset + precision/recall metrics on the filter

### Later
- Sentiment scoring per update
- Entity extraction (companies, people, indicators)
- Chart overlays (correlate news with market data)
- Multi-country comparison dashboard
- Fine-tuned filter model on user feedback (thumbs up/down on updates)

## Cost profile (current)
- RSS: free
- Gemini 3 Flash: ~$0.001–0.003 per scan (~80 items)
- Hosting: Lovable free tier

## Run locally
\`\`\`bash
bun install
bun dev
\`\`\`
Requires `GROQ_API_KEY` in env (auto-provisioned on Lovable).
