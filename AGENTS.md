@AGENTS.md

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

### Task
When you use Gmail or Google Calendar, it's likely a regular workflow takes a few more clicks than it should. Or maybe sending a calendar invite is too many steps on the UI. Many startups have tried to make managing your email and calendar seamless. But this is hard to do because everyone uses it slightly differently.

Corsair provides the building blocks to hundreds of integrations. You can use those building blocks to wire your app into almost any other app. You can also use Corsair's MCP to let any agent get full access to integrations so it can do things on your behalf. This means you can make new UIs that are set up exactly how you need, and power them using Corsair.

integration docs url: https://api.corsair.dev/md/integrations

Your task will be to create a Superhuman clone. Use Corsair to create Gmail and Google Calendar integrations. Use the Gmail API to make it more intuitive to search, draft, send, and receive emails. Use the Google Calendar API to make it easier to manage your schedule and send calendar invites and updates.

Once this is done, your email and calendar management will not be limited to how Google, Superhuman, or anyone else sees the way your workflows _should_ be. Instead, you can decide exactly what needs to be more prominent.


- **Probably the most high-value bonus task:** Add agent chat using the Corsair MCP. This will let users chat to send emails and calendar invites. For example, "Send a calendar invite to friend@corsair.dev at 9 AM next Thursday. Send him an email too saying I look forward to our meeting."
- Use Corsair's built-in webhooks so you can get all new emails and calendar invites in realtime without having to poll the Google APIs
- Add automatic email filtering. Send the email subject + body through a very cheap LLM to determine priority level
- Wire in keystrokes so you can do common actions via the keyboard instead of having to click around
- Use the Corsair search API to add a better UI around Gmail advanced search



Agent Prompt: Gmail + Google Calendar Demo (Corsair)
Build a simple Next.js app with for listing, searching, drafting, and sending emails (Gmail) and calendar invites (Google Calendar). Wire everything through Corsair — do not call Google APIs directly.

What is Corsair?
Corsair is an integration layer for third-party APIs. It provides:

api — live calls to the external service (Gmail, Google Calendar, etc.)
db — reads from Corsair's local Postgres cache of synced entities
Webhooks — incoming events that update the cache when data changes
Multi-tenancy — each tenant has its own OAuth tokens and cached data
Configure once in src/server/corsair.ts:

import 'dotenv/config';
import { createCorsair } from 'corsair';
import { gmail } from '@corsair-dev/gmail';
import { googlecalendar } from '@corsair-dev/googlecalendar';
import { conn } from './db';

export const corsair = createCorsair({
  plugins: [gmail(), googlecalendar()],
  database: conn,
  kek: process.env.CORSAIR_KEK!,
  multiTenancy: true,
});
All tenant-scoped calls:

corsair.withTenant(process.env.TENANT_ID ?? 'dev').gmail.api.threads.list(...)
corsair.withTenant(process.env.TENANT_ID ?? 'dev').gmail.db.messages.list(...)
CLI: discover endpoints — don't guess
Do not assume Corsair APIs. Use the CLI:

pnpm corsair list                          # all live API endpoints
pnpm corsair list --type db                # cached DB entity types
pnpm corsair schema gmail.api.messages.send   # input/output for one endpoint
pnpm corsair schema gmail.db.messages.search  # filter fields for DB search
Notes:

DB entities expose both .list() and .search() (even if only .search shows in list --type db)
Write ops marked [write]; reads marked [read]
If unclear, ask — do not invent APIs.

API vs DB: when to use which
Use case	Use	Why
List/search inbox on page load	gmail.db.messages.list / .search	Avoids rate limits
List calendar events for a week	googlecalendar.db.events.list / .search	Same
"Refresh from Gmail" button	gmail.api.threads.list	Syncs from Google into cache
"Refresh from Calendar" button	googlecalendar.api.events.getMany	Pass timeMin/timeMax for the week
Send email	gmail.api.messages.send	Write — live API
Create/send draft	gmail.api.drafts.create / .send	Write
Create event / send invite	googlecalendar.api.events.create	sendUpdates: 'all' notifies attendees
Read full email on click	gmail.db.messages.findByEntityId first, gmail.api.messages.get fallback	Cache first
Rule of thumb: UI list reads → DB. User-initiated sync or any mutation → API.

tRPC wiring pattern
// src/server/lib/tenant.ts
export function getTenant() {
  return corsair.withTenant(process.env.TENANT_ID ?? 'dev');
}

// src/server/api/routers/gmail.ts
export const gmailRouter = createTRPCRouter({
  searchEmails: publicProcedure
    .input(z.object({ query: z.string(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const tenant = getTenant();
      const messages = input.query.trim()
        ? await tenant.gmail.db.messages.search({
            data: { snippet: { contains: input.query } },
            limit: input.limit,
          })
        : await tenant.gmail.db.messages.list({ limit: input.limit });
      return dedupeAndSort(messages);
    }),

  refreshInbox: publicProcedure.mutation(async () => {
    const tenant = getTenant();
    const result = await tenant.gmail.api.threads.list({ maxResults: 50 });
    return { synced: result.threads?.length ?? 0 };
  }),

  sendEmail: publicProcedure
    .input(z.object({ to: z.string().email(), subject: z.string(), body: z.string() }))
    .mutation(async ({ input }) => {
      const tenant = getTenant();
      const raw = encodeRawEmail(input); // base64url RFC 2822 — NOT plain text
      return tenant.gmail.api.messages.send({ raw });
    }),
});
Wire UI buttons to tRPC via @trpc/react-query (e.g. refresh → api.gmail.refreshInbox.useMutation()).

One-time project setup
pnpm i corsair @corsair-dev/gmail @corsair-dev/googlecalendar @corsair-dev/cli
Google Cloud: create project, enable Gmail + Calendar APIs, create OAuth credentials.

pnpm corsair setup --gmail client_id=... client_secret=...
pnpm corsair setup --googlecalendar client_id=... client_secret=...
pnpm corsair auth --plugin=gmail --tenant=dev
pnpm corsair auth --plugin=googlecalendar --tenant=dev
pnpm corsair auth --plugin=gmail --webhooks
pnpm corsair auth --plugin=googlecalendar --webhooks
Expose localhost via ngrok → /api/webhooks.

DATABASE_URL=postgresql://...
CORSAIR_KEK=<base64 key>
TENANT_ID=dev
Webhook handler
import { processWebhook } from 'corsair';

const result = await processWebhook(corsair, headers, body, {
  tenantId: process.env.TENANT_ID ?? 'dev',
});
// return result.response or 404 if no handler matched
Webhooks keep the DB cache fresh without constant API polling.

Gotchas
Gmail

messages.send / drafts.create require raw: base64url-encoded RFC 2822 (MIME with \r\n, then encode: +→-, /→_, strip =)
messages.get with format: 'full' has nested payload.parts; recursively extract text/plain
DB messages may already have parsed subject, from, to, body — prefer those
Calendar

events.getMany without timeMin returns events from the beginning of time — always pass timeMin/timeMax
sendUpdates: 'none' = save without notifying; 'all' = send invites
DB entities

{ id, entity_id, updated_at, data: { snippet, subject, from, summary, start, ... } }
entity_id = external ID (Gmail message ID, event ID)
Cache can have duplicate entity_id rows — dedupe by entity_id, keep latest updated_at
Search filters use a data wrapper: { data: { subject: { contains: 'hello' } }, limit: 50 }
UI for this demo
Minimal, markdown-like, left-aligned:

Email: inbox (newest first), search, click to read full message, compose + send/draft
Calendar: week view with ←/→ navigation, search, create event, send invite
Format dates ("Today, 3:45 PM"), parse Name <email@example.com>, linkify URLs
Deliverables
tRPC routers: gmail (list, search, get, refresh, draft, send) and calendar (list by week, search, refresh, create, send invite)
Simple React UI wired to those routes
Webhook route at /api/webhooks
Tenant helper + email encoding utilities
Run pnpm corsair list and pnpm corsair schema <endpoint> before writing Corsair calls.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## MVP Scope
Already working:
1. Auth
2. Integrations page
3. Gmail connect
4. Calendar connect
5. Email list/read/send
6. Calendar list/create
7. AI command box

Missing:
1. Realtime sync (corsair webhooks)
2. AI agent with full Corsair tool access
3. Permission/approval layer for dangerous actions