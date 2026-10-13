# BAI-Pharmacy

A pharmacy distribution dashboard for reviewing sales, inventory, customer receivables, supplier payables, and team collections. Import distributor workbooks and use Burmese-language recommendations to prioritize follow-ups, purchasing, and payments.

The project originated from BAI-Commerce. Legacy commerce routes remain in the codebase, while the main navigation focuses on pharmacy operations.

## Features

- **Overview:** Sales, purchases, outstanding balances, stock values, and monthly trends.
- **Sales analysis:** Product and channel performance from MA EI and Mega sales detail sheets.
- **Inventory:** Stock snapshots, movement history, min/max levels, expiry lots, and returns.
- **Receivables and payables:** Customer AR aging and supplier payment priorities.
- **Team:** Collections and outstanding balances by team and area.
- **Imports:** Workbook previews, sheet detection, import summaries, and duplicate detection using per-user import keys.
- **Recommendations:** Pharmacy action suggestions with Gemini integration and rule-based fallbacks.
- **Telegram:** Text and file ingestion, business reports, future plans, and Q&A using stored business context.
- **Administration:** Email/password sign-in, user/admin roles, and user management.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.2, App Router |
| UI | React 19.2.4, TypeScript 5, Tailwind CSS 4, shadcn/Base UI, Lucide |
| Database | PostgreSQL (Supabase), Prisma 7, PostgreSQL adapter, TypedSQL |
| Authentication | Better Auth |
| Server state | TanStack Query 5 |
| Forms | React Hook Form, Zod |
| AI | Google Gen AI SDK, Gemini |
| Spreadsheet parsing | XLSX |
| Notifications | Sonner |
| Optional infrastructure | Upstash Redis for caching, cross-instance events, and rate limiting |
| Tests | Vitest, Testing Library, MSW, Playwright |

Charts are custom React SVG components.

## Local setup

Use Node.js 20.19+ and a PostgreSQL database. Gemini and Telegram credentials are optional for local dashboard development.

Create `.env` in the repository root:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@POOLER_HOST:PORT/DATABASE"
DIRECT_URL="postgresql://USER:PASSWORD@DIRECT_HOST:5432/DATABASE"
BETTER_AUTH_SECRET="replace-with-a-random-secret-at-least-32-characters-long"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="BAI-Pharmacy"
```

`DATABASE_URL` is the application's pooled connection. `DIRECT_URL` is used by Prisma schema and TypedSQL tooling. Set both auth/app URLs to the deployed origin when deploying.

For optional Upstash services, also set:

```dotenv
UPSTASH_REDIS_REST_URL="https://your-redis-endpoint"
UPSTASH_REDIS_REST_TOKEN="your-redis-token"
```

Without these values, caching and events use process-local fallbacks and Redis rate limiting is disabled. The current `.env.example` contains only the optional Upstash variables; use the full configuration above for initial setup.

For a new database:

```bash
npm install --ignore-scripts
npx prisma db push
npm run db:generate
npm run dev
```

TypedSQL generation needs the database schema to exist before it can validate SQL queries. For an already initialized database, normal `npm install` runs client and TypedSQL generation automatically through `postinstall`.

Sign in with an existing administrator account and manage accounts through `/admin/users`. There is no web-based first-admin bootstrap. A fresh database requires administrator provisioning through trusted server-side tooling before the admin dashboard can be used; this repository does not currently include a bootstrap script.

Schema changes currently use `prisma db push`; there are no checked-in migration files.

## Import pharmacy data

Open `/pharmacy/import` to preview and upload distributor workbooks. Supported uploads are `.xlsx`, `.xls`, `.xlsm`, and `.csv`, up to 10 MB per file.

The importer recognizes purchase orders, invoices, price lists, stock snapshots, receivables, MA EI/Mega sales details, and supported iStock movement, min/max, expiry, store-in, and return exports. Unknown sheets are skipped and reported in the import summary.

Most record imports skip existing import keys by default; use the overwrite option to update matching records. Price-list imports refresh product pricing. Stock periods are inferred from sheet/file names or supplied import options. Weekly invoice splits are skipped in favor of the main invoice sheet, and duplicate purchase orders are deduplicated by import key.

See [data-files/README.md](data-files/README.md) for workbook groups and suggested import order.

## Telegram and Gemini

Configure the bot token, Gemini API key, and model through `/settings`. These values are stored in `BotSettings`, rather than read from environment variables.

Saving a new bot token registers `/api/telegram/webhook` with Telegram using the request's origin. Use a publicly accessible HTTPS origin for Telegram delivery. Each bot has a stored webhook secret, sent by Telegram in the `x-telegram-bot-api-secret-token` header.

The bot supports Q&A, business-report, and future-plan modes. Text reports are parsed into structured records; uploaded files are processed after the webhook response using Next.js `after()`. Report parsing falls back to heuristics if Gemini is unavailable.

## Commands and checks

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server on port 3000 |
| `npm run build` | Generate Prisma client/TypedSQL and create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate Prisma client and TypedSQL |
| `npx prisma db push` | Apply the schema to the configured database |
| `npm test` | Run Vitest tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run Playwright Chromium tests |

Production builds require access to the initialized database through `DIRECT_URL` for TypedSQL generation. The generated Prisma client lives in `src/generated/prisma`.

Real-database Vitest checks are opt-in with `MEASURE_INVENTORY=1` and a configured `DATABASE_URL`. Playwright uses localhost:3000 and starts the dev server if one is not already running; install Chromium with `npx playwright install chromium` before the first run.

## Project structure

```text
prisma/
  schema.prisma                 # Auth, pharmacy, and legacy commerce models
  sql/                          # TypedSQL analytics queries
src/
  app/
    (auth)/                     # Sign-in and registration
    (dashboard)/pharmacy/       # Overview, sales, inventory, AR, payables, team, import
    (dashboard)/settings/       # Bot, AI, and target configuration
    api/pharmacy/               # Pharmacy analytics and import endpoints
    api/telegram/webhook/       # Telegram ingestion
  components/
    pharmacy-workspace.tsx      # Pharmacy dashboard views
    commerce-charts.tsx         # Shared SVG charts
    commerce-cards.tsx          # Shared cards and suggestions
    ui/                         # UI primitives
    layout/                     # Dashboard navigation and layout
  hooks/use-pharmacy.ts         # Pharmacy queries and mutations
  lib/
    pharmacy-import.ts          # Workbook detection, parsing, and bulk imports
    pharmacy-calculations.ts    # Pharmacy calculation helpers
    text-normalize.ts           # Shared text, number, and Burmese digit normalization
    demand-parser.ts            # Gemini parsing and Q&A
    auth.ts                     # Better Auth configuration
    prisma.ts                   # Shared PostgreSQL pool and Prisma client
    upstash.ts                  # Cache, events, and rate limiting
  proxy.ts                      # Next.js 16 session-cookie route gate
 tests/                         # Vitest tests
 e2e/                           # Playwright tests
 data-files/                    # Distributor workbooks and import notes
 design-system/                 # Pharmacy UI guidelines
```

Pharmacy records are user-scoped and support soft deletion. API handlers enforce access rules; `src/proxy.ts` provides the lightweight session-cookie gate.

Before changing pharmacy pages, read [design-system/pharmacy-ui-notes.md](design-system/pharmacy-ui-notes.md). Repository development guidance is in [AGENTS.md](AGENTS.md).
