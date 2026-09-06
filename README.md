# AI PR Reviewer

A GitHub webhook bot that automatically reviews pull requests with Claude and
posts the review back as a PR comment — plus a small dashboard to browse past
reviews.

```
GitHub PR opened/updated
        │  (pull_request webhook, HMAC-signed)
        ▼
POST /webhook/github  ──▶  verify X-Hub-Signature-256  ──▶  401 if invalid
        │ (valid + opened/synchronize)
        │ 202 Accepted (respond fast, review runs in the background)
        ▼
Fetch PR diff (GitHub REST API, diff media type)
        ▼
Ask Claude to review the diff (summary, risks, missing tests, risk level)
        ▼
Save to Postgres (pull_requests, reviews)          ◀── GET /reviews, /reviews/:id
        ▼                                               │
Post the review back as a PR comment                    ▼
                                                   Static dashboard at "/"
```

All AI calls and GitHub API calls happen server-side — your `ANTHROPIC_API_KEY`
and `GITHUB_TOKEN` never reach the browser.

## Stack

- **Node.js + TypeScript + Express** — the webhook server and JSON API
- **PostgreSQL** — stores every review (`pull_requests`, `reviews` tables)
- **Claude API** (`@anthropic-ai/sdk`) — generates the review, as structured JSON
- **GitHub REST API** (`@octokit/rest`) — fetches PR diffs, posts review comments
- **Static HTML/JS dashboard** — no build step, served straight from Express

## What you need

- Node.js 18+
- Docker (for Postgres) — or your own local/hosted Postgres instance
- A GitHub personal access token
- An Anthropic API key
- A way for GitHub to reach your webhook endpoint (a public URL, or a tunnel
  like `ngrok`/`smee.io` for local development)

## Setup

### 1. Start Postgres

```bash
docker compose up -d
```

This starts Postgres 16 on `localhost:5432` and automatically runs
`db/init/001_init.sql` on first boot, creating the `pull_requests` and
`reviews` tables. Data persists in a named Docker volume (`pgdata`) across
restarts.

If you'd rather use your own Postgres instance, just point `DATABASE_URL` at
it and run `db/init/001_init.sql` against it manually:

```bash
psql "$DATABASE_URL" -f db/init/001_init.sql
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Then fill in `.env`:

| Variable | Description |
| --- | --- |
| `PORT` | Port the server listens on (default `3000`) |
| `DATABASE_URL` | Postgres connection string (default matches `docker-compose.yml`) |
| `GITHUB_WEBHOOK_SECRET` | Shared secret used to verify webhook signatures — see below |
| `GITHUB_TOKEN` | Personal access token used to fetch diffs and post comments — see below |
| `ANTHROPIC_API_KEY` | Your Claude API key — see below |
| `CLAUDE_MODEL` | Model used for reviews (defaults to `claude-sonnet-5`) |

### 4. Run the server

```bash
npm run dev      # ts-node/tsx with auto-reload, for local development
# or
npm run build && npm start   # compiled JS, for production
```

Visit **http://localhost:3000** for the dashboard, or `GET /health` for a
liveness check.

## Getting the credentials

### Create a GitHub personal access token

The token needs to be able to read pull requests/diffs and write comments.

1. GitHub → **Settings → Developer settings → Personal access tokens**.
2. Easiest: a **classic token** with the `repo` scope (full control of
   private repos — needed to read PR contents and write comments). For a
   narrower **fine-grained token**, grant it access to the specific
   repo(s) with **Contents: Read-only** and **Pull requests: Read and
   write** permissions.
3. Copy the token into `GITHUB_TOKEN` in `.env`.

### Create a GitHub webhook

1. On the repo (or org) you want reviewed: **Settings → Webhooks → Add
   webhook**.
2. **Payload URL**: `https://<your-public-host>/webhook/github`
   - For local development, expose your server with a tunnel first, e.g.:
     `ngrok http 3000` → use the `https://...ngrok-free.app/webhook/github`
     URL it gives you.
3. **Content type**: `application/json`.
4. **Secret**: generate a random string (e.g. `openssl rand -hex 32`) and put
   the *same* value in both the GitHub webhook settings and
   `GITHUB_WEBHOOK_SECRET` in `.env`.
5. **Which events**: choose "Let me select individual events" → check
   **Pull requests** only (the server ignores every other event type anyway).
6. Save. GitHub will send a `ping` event immediately — the server responds
   `200` and ignores it (it only acts on `pull_request` events with action
   `opened` or `synchronize`).

### Get an Anthropic API key

1. Sign up / log in at [console.anthropic.com](https://console.anthropic.com).
2. **Settings → API Keys → Create Key**.
3. Copy it into `ANTHROPIC_API_KEY` in `.env`.

## Trying it end-to-end

Once the webhook is configured and the server is reachable from GitHub, open
a pull request (or push a new commit to an open one) on the configured repo.
Within a few seconds you should see:

1. A new row on the dashboard (`http://localhost:3000`).
2. A comment posted on the PR itself, from the account whose token you used,
   summarizing the change, flagging risks, and noting missing test coverage.

## Testing the webhook without GitHub

`scripts/test-webhook.ts` sends a synthetic, correctly-shaped `pull_request`
payload directly to your running server and checks the signature
verification logic — no real GitHub repo, token, or Claude key required for
this part.

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run test:webhook
```

It sends three requests and checks the response codes:

1. **Correct signature** (computed with the `GITHUB_WEBHOOK_SECRET` from your
   `.env`, or `test-secret` if unset) → expects `200`/`202`.
2. **Wrong secret** → expects `401`.
3. **No signature header at all** → expects `401`.

```
Testing http://localhost:3000/webhook/github
Using GITHUB_WEBHOOK_SECRET="test-secret" (default — set GITHUB_WEBHOOK_SECRET to match your server)

[1] valid signature   -> status 202 {"message":"Accepted — review is being generated"}
    OK

[2] wrong secret      -> status 401 {"error":"Invalid or missing webhook signature"}
    OK

[3] missing signature -> status 401 {"error":"Invalid or missing webhook signature"}
    OK

All checks passed.
```

If `GITHUB_TOKEN` and `ANTHROPIC_API_KEY` are also configured, the accepted
request in step 1 will trigger a real attempt to fetch a diff from
`example/example-repo` in the background — which will fail with a 404 since
that repo doesn't exist. That's expected; check the server logs. To see a
full successful review end-to-end, use a real PR as described above.

## API reference

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/webhook/github` | GitHub webhook receiver. Verifies `X-Hub-Signature-256`, returns `401` if invalid. Returns `200` for ignored events, `202` when a review has been queued. |
| `GET` | `/reviews` | List all reviews (most recent first), joined with their PR info. |
| `GET` | `/reviews/:id` | Full detail for one review, including risks, missing-test notes, and the raw Claude response. |
| `GET` | `/health` | Liveness check. |
| `GET` | `/` | Static dashboard. |

### `GET /reviews` response shape

```json
[
  {
    "id": 1,
    "risk_level": "medium",
    "verdict": "comment",
    "summary": "Adds retry logic to the payment webhook handler...",
    "created_at": "2026-01-15T10:32:00.000Z",
    "repo": "example/example-repo",
    "pr_number": 42,
    "pr_title": "Add retry logic to the payment webhook handler",
    "pr_url": "https://github.com/example/example-repo/pull/42"
  }
]
```

### `GET /reviews/:id` response shape

Same fields as above, plus:

```json
{
  "risks": ["Retry loop has no backoff and could hammer the endpoint under sustained failure"],
  "missing_tests": ["No test covers the retry-exhausted path"],
  "raw_response": "{...the raw JSON Claude returned...}",
  "diff_summary": "Adds retry logic to the payment webhook handler..."
}
```

## Database schema

`db/init/001_init.sql` creates two tables:

- **`pull_requests`** — one row per `(repo, pr_number)`. Tracks the latest
  known title, URL, and diff summary. Upserted on every review so
  `synchronize` events (new commits pushed to an open PR) update the same
  row rather than creating duplicates.
- **`reviews`** — one row per review generated, referencing its parent PR.
  Stores `risk_level`, `verdict`, `summary`, `risks` (JSON array),
  `missing_tests` (JSON array), and the raw model response. A PR that's
  updated multiple times (multiple `synchronize` events) will have multiple
  review rows — the dashboard shows all of them, most recent first.

## Design notes / caveats

- **Fast webhook responses.** The webhook handler verifies the signature and
  responds immediately (`200` for ignored events, `202` for accepted ones);
  the actual diff fetch + Claude call + DB write + comment post happens
  asynchronously. This matches GitHub's guidance to respond within a few
  seconds — a webhook that blocks on an LLM call risks GitHub treating the
  delivery as failed and retrying it.
- **Structured output.** The review prompt uses Claude's structured outputs
  (`output_config.format` with a JSON schema) rather than asking for JSON in
  prose and hoping — the response is parsed directly with no regex or retry
  logic needed.
- **Diff truncation.** Diffs over ~15,000 characters are truncated before
  being sent to Claude, to keep cost and latency predictable on very large
  PRs. The truncation is clearly marked in the prompt.
- **Comment posting failures don't lose the review.** If posting the PR
  comment fails (e.g. the token lacks write access), the review is still
  saved to Postgres and visible on the dashboard — only the comment step is
  best-effort.
- **Model choice.** Defaults to `claude-sonnet-5` — a good balance of quality
  and cost for a task like this (structured, bounded-length review
  generation, not open-ended agentic work). Override via `CLAUDE_MODEL` in
  `.env` if you want a different model.
- **No auth on the dashboard/API.** This is an MVP — `GET /reviews*` is
  unauthenticated. Put it behind a reverse proxy with auth (or add your own
  middleware) before exposing it publicly.

## Project structure

```
.
├── db/init/001_init.sql       # Postgres schema, auto-applied by docker-compose
├── docker-compose.yml         # Postgres service
├── public/                    # static dashboard (no build step)
│   ├── index.html
│   ├── app.js
│   └── style.css
├── scripts/
│   └── test-webhook.ts        # synthetic signed-payload test
└── src/
    ├── index.ts                # entrypoint
    ├── server.ts                # Express app wiring
    ├── config.ts                # env var loading
    ├── db.ts                    # Postgres pool
    ├── repository.ts            # SQL queries
    ├── github.ts                 # signature verification, diff fetch, comment post
    ├── claude.ts                 # Claude prompt + structured-output review
    ├── reviewService.ts          # orchestrates the full review pipeline
    ├── types.ts
    └── routes/
        ├── webhook.ts            # POST /webhook/github
        └── reviews.ts            # GET /reviews, GET /reviews/:id
```
