# Working notes for this repository

Read this before changing the sandbox setup or the public site.

## What the app is

A single Cloudflare Worker (`wrangler.toml` → `src/index.js`) that serves both an
API and static assets from `public/`. State lives in one Durable Object
(`BotCoordinator`, SQLite-backed) plus an optional KV namespace. There is no
separate database service to run locally.

Two front ends share the same asset bundle:

| URL | File | What it is |
|-----|------|------------|
| `/` | `public/index.html` | Public portfolio page (portfolio.css / portfolio.js) |
| `/panel/` | `public/panel/index.html` | The Telegram bot admin panel |

The panel was moved from `/` to `/panel/` when the portfolio took over the home
page. Its asset references are absolute (`/panel.css`, `/panel.js`, `/vendor/…`),
so nothing else had to change — but keep `scripts/build-panel.mjs` in sync: it
patches `public/panel/index.html` (NOT `public/index.html`) with the version
query strings. The customer Mini App is served from `public/portal/`.

## Running it here

```bash
docker compose -f docker-compose.base44.yml up -d --build
docker compose -f docker-compose.base44.yml logs -f app
```

- `wrangler dev` runs in local mode on port 3000, source bind-mounted, so edits
  reload without rebuilding the image. Tailwind/fonts/icons are regenerated into
  `public/` by `npm run build` at container start.
- Check it answers: `curl -s localhost:3000/api/health` (proxied host header works
  too — no host/origin allowlist is involved on this stack).
- Tests: `docker compose -f docker-compose.base44.yml exec app npm test`
  (`node --test tests/*.test.mjs`). The Playwright scripts in `tests/browser*.mjs`
  are not part of `npm test`.

## Secrets

`/run/base44/app.env` (absolute path, outside the repo) is wired in twice, on
purpose:

1. `env_file:` gives the container process environment (useful for shell tooling).
2. The same file is bind-mounted at `/app/.dev.vars`, because **`wrangler dev`
   binds Worker secrets only from `wrangler.toml` vars or a `.dev.vars` file — not
   from the container's process env**. Mounting keeps the values out of the
   checkout (they never enter git) and wrangler reports them as `(hidden)`.

Portfolio contact-form mail needs:

| Name | Purpose |
|------|---------|
| `RESEND_API_KEY` | Resend API key (`https://api.resend.com/emails` is called with plain `fetch`) |
| `CONTACT_TO_EMAIL` | Inbox that receives the submissions |
| `CONTACT_FROM_EMAIL` | Optional sender; defaults to the `wrangler.toml` value |

Without the first two the endpoint answers `503 email_not_configured` and the form
shows an error state — nothing else breaks, so the app boots before the keys land.
Resend only accepts the shared `onboarding@resend.dev` sender for its own account
owner, so verify a domain (or set `CONTACT_FROM_EMAIL`) before using it for real.

## Contact endpoint

`POST /api/contact` (`src/routes/contact.routes.js`) is public by design:
validated, per-IP rate limited through the same KV store the login throttle uses,
and protected by a honeypot field (`company`) that answers `200` without sending.

## Quirks worth remembering

- Requests to `/api/*` are handled inside the Durable Object; `env` there is
  `{...env, BOT_KV, __coordinated}`, so Worker secrets are visible to routes.
- Never commit `.wrangler/` or `node_modules/` — both are named volumes.
- The project has no `.gitignore`; keep generated state out of the working tree.
