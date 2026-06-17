# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # start Next.js dev server (localhost:3000)
pnpm build        # production build
pnpm lint         # ESLint
npx prisma migrate dev   # run DB migrations
npx prisma generate      # regenerate Prisma client after schema changes
npx prisma studio        # browse the database
```

No test suite exists yet.

## Architecture Overview

WSAI is a SaaS AI workspace that replaces Gmail + Google Calendar. It is a **Next.js 16 App Router** monolith with server actions, streaming API routes, and Prisma/PostgreSQL.

### Key layers

**Auth** — `better-auth` with email/password and Google/GitHub OAuth. Session is read server-side via `lib/session.ts:getCurrentSession()` and client-side via `lib/auth-client.ts`. The Better Auth user ID doubles as the Corsair `tenantId`.

**Database** — Prisma with `@prisma/adapter-pg` (PgPool). The client singleton lives at `lib/db.ts`. Schema at `prisma/schema.prisma`. Generated client outputs to `lib/generated/prisma/`.

**Corsair** — the external integration layer (npm packages `corsair`, `@corsair-dev/gmail`, `@corsair-dev/googlecalendar`). All credential storage, OAuth, sync, and permission gating go through Corsair. The singleton factory is at `lib/corsair/server.ts`.

- `getCorsairInstance()` — no approval gates, used for data reads and sync jobs.
- `getCorsairAgentInstance(approvalStrict)` — used by the AI agent; gates write operations based on the user's approval setting (`"all" | "writes" | "never"`).
- `ensureCorsairSetup(tenantId)` — must be called before any Corsair operation for a tenant; cached per-process.
- `syncCorsairPlugin(tenantId, plugin)` in `lib/corsair/sync.ts` — pulls data from Gmail/Calendar into Corsair's local entity cache (`corsair_entities` table).

**Module registry** — `lib/modules/types.ts` defines `WSAIModule`. New integrations implement that interface and register in `lib/modules/registry.ts`. The shell picks up nav items and command-palette actions automatically.

**Agent** — `server/agent/run-agent.ts` streams events from OpenAI Agents SDK (`@openai/agents`) through Corsair MCP tools. The model provider resolves as: user's own API key → `OPENROUTER_API_KEY` env var. The streaming response is newline-delimited JSON (`AgentStreamEvent`) consumed by the chat float. `run_script` receives a `{ code }` JS string — not `plugin/script/input`.

**API routes** — all under `app/api/`:
- `corsair/callback` — OAuth completion, triggers initial sync.
- `corsair/webhook` — receives Corsair push events, triggers incremental sync via `after()`.
- `agent/chat` — streams agent events; reads user settings (API key, approvalStrict) from DB.
- `mail/threads`, `mail/action`, `mail/draft`, `mail/send`, `mail/sync` — mail data and actions.
- `calendar/events`, `calendar/action`, `calendar/sync` — calendar data and actions.
- `realtime/` — SSE endpoint for sync-status notifications.
- `approvals/` — list and approve/deny pending Corsair permission requests.

**UI** — React 19 + Tailwind v4 + shadcn components in `components/ui/`. Core shell in `components/shell/app-shell.tsx` (sidebar, command palette ⌘K, AI chat float). Mail workspace at `components/mail/mail-workspace.tsx`. Calendar at `components/calendar/calendar-dashboard.tsx`.

**Background jobs** — Inngest client at `inngest/client.ts`; functions exported from `inngest/functions.ts` (currently empty — sync is triggered inline via `after()` in webhook/callback routes).

### Data flow for mail/calendar

1. Corsair syncs raw entities into `corsair_entities` rows.
2. `GET /api/mail/threads` / `GET /api/calendar/events` read from `corsair_entities` via Prisma and map to `MailThread` / `CalendarEvent` (types in `lib/workspace-types.ts`).
3. React Query on the client polls/refetches these routes.
4. Agent uses Corsair's `run_script` tool with JS code that calls `corsair.gmail.db.*` (cached) or `corsair.gmail.api.*` (live) directly.

### Route groups

- `app/(auth)/` — login, signup (no shell)
- `app/(shell)/` — authenticated pages wrapped by `AppShell`: mail, calendar, agent, approvals, integrations, settings

### Important env vars

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Auth secret (also fallback for `CORSAIR_KEK`) |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | App base URL |
| `BETTER_AUTH_GOOGLE_CLIENT_ID/SECRET` | Google OAuth (reused by Corsair) |
| `CORSAIR_KEK` | Key-encryption key for Corsair credentials |
| `CORSAIR_WEBHOOK_URL` | Override base URL for Corsair webhooks (use ngrok in local dev) |
| `OPENROUTER_API_KEY` | Default model provider for the AI agent |


# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
