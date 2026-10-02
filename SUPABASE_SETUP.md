# Supabase deployment

The connected project is **Monopoly**, reference `tasgfyupdivohkjhkvpk`, in EU West (Ireland).
Dashboard: https://supabase.com/dashboard/project/tasgfyupdivohkjhkvpk

## Architecture

Cloudflare Workers serves the frontend. Its Worker handler forwards `/api/*` to the Node backend. The backend uses Supabase PostgreSQL for accounts, hashed sessions, online rooms and temporary finished-game results. No persistent backend disk is required. Existing username/password login and salted scrypt hashing remain in place; this change uses Supabase Database, not Supabase Auth. Email/password recovery is not added by this migration.

The `monopoly` schema is private, not exposed through the Data API. Tables have RLS enabled with no browser policies, intentionally denying browser access. Only the trusted backend connects to PostgreSQL. Never put the database URL or password in a VITE_ variable.

## Backend configuration

1. Open the project's **Connect** dialog and copy the **Session pooler** PostgreSQL connection string (port 5432). Replace its password placeholder with the database password, URL-encoding special characters. Reset the database password in the dashboard if necessary; do not post it in chat.
2. In the backend host's secret environment settings add:
   - `SUPABASE_DB_URL`: the complete connection string.
   - `NODE_ENV=production`
   - `APP_ORIGIN=https://monopoly.olufowosere.com`
   - `API_PROXY_SECRET`: a random secret also configured on Cloudflare.
3. Deploy using the repository Dockerfile, or Node 24 with build `npm ci && npm run build` and start `npm run server`.
4. Remove `DATABASE_PATH` and the persistent disk only after existing data has been imported and the new deployment verified. Never delete the old database first.
5. Check the backend's `/api/health`: it queries the database and must return `{"ok":true}`.

TLS certificate verification is enabled. If the pooler's certificate needs Supabase's CA, download the certificate from Database Settings and paste its complete PEM contents into the backend environment variable `SUPABASE_DB_CA`. Include the BEGIN CERTIFICATE and END CERTIFICATE lines. Save and redeploy the backend. Alternatively, set `SUPABASE_DB_CA_FILE` to its server-side file path. Do not disable verification.

## Cloudflare Workers (your current deployment)

Your Cloudflare project was initially static-assets-only. The included `worker/index.js` and `wrangler.jsonc` add executable API routing while serving `dist` as frontend assets. `/api` and `/api/*` run through the Worker first, preventing SPA fallback from returning the game for API requests.

1. Set `name` in wrangler.jsonc to the exact existing Worker name shown in Cloudflare (not the custom domain). This avoids creating a separate Worker.
2. Commit and push the code.
3. Under Worker Settings > Build, set build command `npm run build`, deploy command `npx wrangler deploy`, repository root the project root. Replace any static-only deploy command such as `npx wrangler deploy --assets ./dist` with `npx wrangler deploy`.
4. Redeploy once. Runtime variables become available after the Worker script is deployed.
5. In Settings > Variables and Secrets add `BACKEND_ORIGIN` as Text (your HTTPS Node backend origin without /api), and `API_PROXY_SECRET` as Secret (the same value configured on the Node backend). Save and deploy the settings.
6. Check the existing custom domain remains attached to this Worker, then verify `/api/health`, signup and two-player play.

`keep_vars` preserves dashboard text variables on subsequent Wrangler deployments. Database credentials remain on the Node backend, not in this proxy Worker.

Cloudflare Pages remains supported through `functions/api/[[path]].js`, but you do not need to create or switch to Pages. For Pages, use build `npm run build`, output `dist`, and the same BACKEND_ORIGIN and API_PROXY_SECRET environment settings.

## Existing account import

Stop writes on the old backend and make a database backup. Set SUPABASE_DB_URL securely, then run:

```sh
npm run migrate:sqlite -- /path/to/accounts.sqlite
```

The importer requires an empty target and imports accounts, hashed sessions and rooms in one transaction. Existing passwords keep working. It reads the SQLite source without modifying it. Run it on the host containing the actual deployed database; importing a local development file does not import Render's accounts.

## Local development and testing

Copy `.env.example` to `.env` and replace its placeholder with the real connection string to use Supabase locally. `npm run server` loads `.env`. Without SUPABASE_DB_URL, development uses the existing local SQLite database; production refuses to start without Supabase configuration.

`npm test` checks the shared asynchronous storage flow, account validation, cookies, concurrency and game authorization using isolated SQLite fixtures. The hosted schema and transaction SQL have also been checked through the connected Supabase tools.

The first release still scans room payloads and serializes transactions with one database advisory lock. Keep one backend instance for now; refine room indexes and per-room locking before scaling. Local rate limits remain process-local.
