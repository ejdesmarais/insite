# eGain Visitor InSite

A prototype web tool that turns nginx weblog data from egain.com into sales intelligence. Sales reps open the application, see which companies have been researching eGain, and immediately know who to call, why, what to say, and how hot the lead is.

If you just want to understand the app interface and navigation, start with the [User Guide](users-guide.md).

---

## Assignment Goal

Build a live prototype for the eGain AI Solutions Architect take-home that processes weblog data and surfaces actionable insights for a sales rep.

---

## Quick Start (for local deployment)

### Prerequisites

- Docker and Docker Compose
- OpenAI API Key (optional)
- Kickfire API Key (optional)

This project can be run without docker, but is not advised.
This project will run without the aforementioned API keys, but will default to pre-seeded AI content provided with the project rather than live resolution and recommendations.

### Run with Docker Compose

```bash
docker compose up --build
```

Local application is accessible at `http://localhost:3082`. 

On first run the container seeds the pre-parsed database automatically. You do not need to generate demo data yourself.

Optional: create `.env` from `.env.template` if you want to set `OPENAI_API_KEY` for live AI generation or provider keys (e.g. Kickfire) for enrichment experiments.

To stop: `docker compose down`

### Without Docker (non-preferred)

Requires Node.js 22+.

```bash
npm install
npm run dev             # starts API server + Vite dev server concurrently
```

App is accessible at `http://localhost:5173` (frontend proxies API to `localhost:3082`).  The first `npm run dev` or `npm start` run bootstraps synthetic logs, parses them into SQLite, and seeds default AI content if the local database has no accounts.

To regenerate the synthetic logs and re-parse the database, see [Regenerating demo data](#regenerating-demo-data). The short version is:

```bash
node src/log-generator/generate.js
node src/backend/parse.js
node src/backend/seed-ai.js   # reseed default AI content (skip if using a live key)
```

---

## Demo/Synthetic Data

eGain did not provide actual web server log data for this exercise. This repo includes a synthetic nginx log generator (`src/log-generator/generate.js`) that creates plausible traffic patterns against real corporate IP ranges. The company/IP mappings are intentionally realistic: the IP ranges resolve to real enterprise networks and can be validated with KickFire when `KICKFIRE_API_KEY` is configured. The visit behavior itself is simulated so the prototype can demonstrate a true-to-life sales workflow without claiming these companies actually visited eGain.

The generator produces standard nginx Combined Log Format files in a realistic logrotate layout. Additionally, the log content contains a mix of legitimate visits from 'company visitors' (the data shown in the app), alongside generic anonymous visitors, search crawlers, SEO tools, etc. The noise traffic is filtered out at ingestion by the server logic.

### Regenerating demo data

The demo data is reproducible from the checked-in generator config at `src/log-generator/config.json`:

```json
{
  "timeframe": "2w",
  "rate": 4800,
  "seed": 20260613,
  "timezone": "-0700"
}
```

From your local clone, run:

```bash
node src/log-generator/generate.js
node src/backend/parse.js
node src/backend/seed-ai.js
```

This rebuilds the full demo dataset:

1. `generate.js` rewrites `src/log-generator/logs/` with fresh nginx-style `access.log*` and `error.log` files. The run is deterministic for a given `seed`, but timestamps are generated relative to the current time.
2. `parse.js` reads `src/log-generator/logs/` by default, filters bots/assets/noise, resolves the demo corporate IP ranges through the mock enrichment provider, recomputes sessions/scores/stages, and replaces the `accounts` plus `ai_content` tables in SQLite.
3. `seed-ai.js` repopulates the default AI summaries, recommendations, and outreach emails. Skip this step if you want the app to generate live AI content with `OPENAI_API_KEY`.

To parse a different log directory, set `LOG_DIR` in .env or inline:

```bash
LOG_DIR=/path/to/nginx/logs node src/backend/parse.js
```

`npm run dev` and `npm start` also run `npm run bootstrap` first. Bootstrap generates logs, parses them, and seeds AI content only when the configured database has no accounts yet. To force a full rebuild, run the three commands above explicitly.

With Docker, the image build runs the same generation/parse/seed pipeline and bakes the resulting `egain.db` into the image. On first container start, that seed database is copied into the persistent `/data/egain.db` volume; existing volumes are preserved on later starts.

---

## Limitations

This prototype operates at account level, not contact level.

Raw nginx logs record IP addresses and user-agent strings. This level of data does not alone contain the granularity required to identify personas. A real-world application would likely leverage a combination of tracking/enrichment services and technologies (e.g. pixels, google analytics, etc.) to support identification at the individual-level.

---

## Environment Variables

You can copy `.env.template` to `.env` if you want to override defaults or enable live providers in your own clone of this repo. Supported environment variables are:

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | *(blank)* | **Optional.** Set to enable live generation and regeneration. Pre-seeded content will be used if unset. |
| `OPENAI_MODEL` | `gpt-5-nano` | Model used for live AI generation. Defaults to gpt-5-nano for low-cost use. |
| `OPENAI_MAX_RETRIES` | `6` | Exponential backoff max retries when using an OpenAI key. Best practice per OpenAI Cookbook. |
| `OPENAI_REQUEST_TIMEOUT_MS` | `30000` | Per-request OpenAI timeout so generation cannot hang indefinitely |
| `OPENAI_MAX_INPUT_TOKENS` | `3000` | Trims session list if payload exceeds this |
| `PORT` | `3082` | Express server port |
| `LOG_DIR` | *(auto-discover)* | Path to log run dir; auto-discovers latest if unset |
| `ENRICHMENT_PROVIDER` | `mock` | `mock` for synthetic logs, or `kickfire` for real-IP B2B enrichment |
| `KICKFIRE_API_KEY` | *(blank)* | If set, this app will use Kickfire to resolve log IP addreses to enriched company data (live). Otherwise, the app will default to mock. |
| `KICKFIRE_API_BASE_URL` | `https://api.kickfire.com/v3` | Self-explanatory |
| `REGEN_RATE_LIMIT_ENABLED` | `true` | Default behavior restricts AI content regeneration to once per hour. Set to `false` to bypass this restriction. |

---

## Deployment Notes

The Docker setup (`Dockerfile` + `docker-compose.yml` + `entrypoint.sh`) runs the full stack in a single container:

1. The **build stage** generates synthetic logs, parses them into `egain.db`, and seeds default AI content via `seed-ai.js`. This DB is baked into the image.
2. On **first container start**, `entrypoint.sh` copies the baked-in DB to the persistent volume at `/data/egain.db`. Subsequent starts use the persisted DB as-is.
3. The server starts and serves the built frontend + API on port 3082.

The SQLite database persists as long as the Docker volume does. Restarting the container without clearing the volume preserves any cached AI content.
