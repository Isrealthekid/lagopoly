# Supabase deployment

The connected project is **Monopoly**, reference `tasgfyupdivohkjhkvpk`, in EU West (Ireland).
Dashboard: https://supabase.com/dashboard/project/tasgfyupdivohkjhkvpk

## Architecture

Cloudflare Pages serves the frontend. Pages Functions forwards `/api/*` to the Node backend. The backend uses Supabase PostgreSQL for accounts, hashed sessions, online rooms and temporary finished-game results. No persistent backend disk is required. Existing username/password login and salted scrypt hashing remain in place; this change uses Supabase Database, not Supabase Auth. Email/password recovery is not added by this migration.

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

TLS certificate verification is enabled. If the pooler's certificate needs Supabase's CA, download the certificate from Database Settings and set `SUPABASE_DB_CA_FILE` to its server-side file path. Do not disable verification.

## Cloudflare Pages

Set build command `npm run build`, output directory `dist`, root directory the repository root. Add production environment variables/secrets:

- `BACKEND_ORIGIN=https://YOUR-NODE-BACKEND-HOST` (no /api suffix).
- `API_PROXY_SECRET`: the same random secret as the backend.

The included `functions/api/[[path]].js` forwards requests, Origin, cookies and responses. It adds an authenticated client IP header for per-player rate limits. Commit and push the code to redeploy; test `https://monopoly.olufowosere.com/api/health`, signup, login, logout, room joining and reconnect using two browser profiles.

This Functions layout is for Cloudflare Pages. A Workers deployment needs a Worker route instead.

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
