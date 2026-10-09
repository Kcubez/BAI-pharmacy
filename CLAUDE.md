# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Next.js 16 — breaking changes from your training data

This repo runs **Next.js 16.2.2 / React 19**. Conventions differ from Next 13–15. Before writing framework code, read the relevant guide in `node_modules/next/dist/docs/` (notably `01-app/01-getting-started/16-proxy.md`). Specifics seen in this codebase:

- **Middleware is now `src/proxy.ts`**, exporting `export async function proxy(req)` (not `middleware.ts` / `middleware()`). Same `config.matcher` API.
- `next/server` exports `after()` for post-response background work (used in the Telegram webhook to process files after returning 200).

## Commands

```bash
npm run dev          # dev server (http://localhost:3000)
npm run build        # production build
npm run start        # serve production build
npm run lint         # eslint (flat config, eslint-config-next)
npx prisma generate  # regenerate client into src/generated/prisma (also runs on postinstall)
npx prisma db push   # push schema to the database (no migration files in use)
```

There is **no test suite** configured.

## Environment

Required in `.env`:
- `DATABASE_URL` — pooled Postgres (Supabase); used by the app via the `pg` Pool + Prisma adapter.
- `DIRECT_URL` — direct Postgres connection; used by `prisma.config.ts` for schema operations.
- Telegram webhook authentication uses the per-bot `webhookSecret` stored in `BotSettings`; Telegram must send it in the `x-telegram-bot-api-secret-token` header.
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME` — client-side config (auth client base URL, branding).

## Architecture

A Next.js App Router admin dashboard over a **Telegram bot that ingests business reports** and parses them into structured records with Google Gemini.

### Data flow (the core of the app)
1. Telegram → `POST /api/telegram/webhook` (`src/app/api/telegram/webhook/route.ts`).
2. The webhook is a **stateful bot**: each `TelegramSender.activeReportType` (`qa` | `business_report` | `future_plan`) is toggled by inline-keyboard callbacks and determines how the next message is handled.
3. Text reports → `parseDemandMessageWithGemini`; file uploads (PDF/image/xlsx/csv) → `extractDataFromFile`, run in `after()` so the webhook returns 200 immediately. Both live in `src/lib/demand-parser.ts`.
4. Parsing **always has a heuristic regex fallback** (`parseDemandMessage`) used when no Gemini key is configured or the API fails — it never throws. Spreadsheets are parsed with `xlsx` and chunked (5 rows/call) before being sent to Gemini.
5. Results are written as `DemandRecord` rows, linked to a `Customer` (matched/created by `nameNormalized`) and a `CustomerActivity`. Extracted file text is also stored as a `QADocument` for Q&A context.
6. In `qa` mode, incoming messages are answered by `answerQuestionWithGemini`, fed a context string built from recent records + customers + docs (`buildQAContext`).

Gemini config (`botToken`, `geminiApiKey`, `geminiModel`) is read from the **`BotSettings` row where `isActive = true`** — not from env. Set it via the Settings page.

### Auth
- **Better Auth** (`src/lib/auth.ts`) with the `admin` plugin, email/password, roles `"user"` / `"admin"` stored on `User.role`. Server type: `auth.Session`.
- Client: `src/lib/auth-client.ts` (`signIn`/`signOut`/`useSession`).
- `src/proxy.ts` gates all routes on a session cookie (lightweight, no DB call), redirecting to `/admin/login`. `PUBLIC_PATHS` bypasses it (login, `/setup`, `/api/auth`, `/api/telegram`).
- API routes enforce roles in-handler via `auth.api.getSession({ headers })` — see the `requireAdmin` pattern in `src/app/api/admin/users/route.ts`. The proxy only checks for *a* session, not the role.
- **First-admin bootstrap**: `/setup` + `POST /api/setup` create the first user and elevate to admin, but only when the DB has zero users (then permanently locked).

### Frontend conventions
- Route groups: `(auth)` and `(dashboard)` under `src/app`. Pages are thin; data access goes through hooks.
- **TanStack Query** for all server state. Pattern per domain: typed client in `src/lib/api.ts` → hook in `src/hooks/use-*.ts` exposing a `*Keys` query-key factory + query/mutation hooks with `invalidateQueries` and `sonner` toasts on success/error. Follow this when adding a domain.
- UI: **shadcn** (style `base-nova`, components in `src/components/ui`), Tailwind v4 (config-less, via `@tailwindcss/postcss`; theme in `src/app/globals.css`), `lucide-react` icons. `Providers` (`src/components/providers.tsx`) wires the query client + toaster.
- Forms: React Hook Form + Zod schemas in `src/lib/validations.ts`.

### Prisma
- Client is generated to **`src/generated/prisma`** (not `@prisma/client`); import from `@/generated/prisma/client`. Always re-run `npx prisma generate` after editing the schema.
- Single shared instance in `src/lib/prisma.ts` using `PrismaPg` adapter over a `pg` Pool, cached on `globalThis` in dev.
- Domain models all map to snake_case tables (`@@map`). `BigInt` is used for Telegram IDs — JSON responses must stringify these (see `src/lib/api.ts` types where they become `string`).
- Reports are Burmese/English mixed; `demand-parser.ts` handles Burmese digit conversion. The valid `serviceName` enum values are hard-coded inside the Gemini prompts in `demand-parser.ts` — update them there.
