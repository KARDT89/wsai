# WSAI

A Superhuman-style AI workspace that replaces Gmail and Google Calendar. Built as a Next.js monolith with an AI agent that can read, write, and act across your connected integrations — without ever needing to open Gmail or Google Calendar again.

---

## What it does

- **Mail** — Full inbox with threading, read/unread, star, archive, trash, snooze, reply, reply-all, forward, compose, and label management
- **Calendar** — Week/day/month views, event creation and editing, RSVP, conflict detection, drag-to-reschedule, and invite sending
- **AI Agent** — A streaming chat interface backed by Corsair MCP. The agent can search mail, draft and send emails, create and update calendar events, check availability, and more — with an approval gate for write operations
- **Approvals** — When the AI proposes a write (send email, create event), it's queued here for user review before execution
- **Integrations** — OAuth connect/disconnect for Gmail and Google Calendar via Corsair

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | PostgreSQL + Prisma ORM |
| Auth | better-auth (email/password + Google OAuth) |
| Integrations | Corsair (`corsair`, `@corsair-dev/gmail`, `@corsair-dev/googlecalendar`) |
| AI agent | OpenAI Agents SDK (`@openai/agents`) via OpenRouter |
| UI | React 19, Tailwind v4, shadcn/ui, Hugeicons |
| Data fetching | TanStack Query v5 |
| Background jobs | Inngest |
| Drag and drop | dnd-kit |

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16 (or use the included Docker Compose)
- A Google OAuth app with the following scopes enabled:
  - `gmail.modify`, `gmail.send`, `gmail.compose`
  - `calendar`, `calendar.events`
- An OpenRouter API key (for the AI agent, unless users bring their own)

---

## Local development

### 1. Clone and install

```bash
git clone <repo-url>
cd wsai
pnpm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

This starts PostgreSQL 16 on port `5433` with database `wsai`, user `postgres`, password `password`.

### 3. Configure environment

Copy the example and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5433/wsai

# Auth (generate a random 32+ char string)
BETTER_AUTH_SECRET=your-secret-here
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google OAuth (reused by both better-auth and Corsair)
BETTER_AUTH_GOOGLE_CLIENT_ID=your-google-client-id
BETTER_AUTH_GOOGLE_CLIENT_SECRET=your-google-client-secret

# Corsair key-encryption key (can reuse BETTER_AUTH_SECRET)
CORSAIR_KEK=your-kek-here

# For local Corsair webhooks and OAuth redirects, use ngrok:
# CORSAIR_WEBHOOK_URL=https://your-subdomain.ngrok.io

# AI agent (used when users haven't set their own key)
OPENROUTER_API_KEY=your-openrouter-key
```

### 4. Run migrations and generate the Prisma client

```bash
npx prisma migrate dev
npx prisma generate
```

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables reference

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Auth signing secret |
| `BETTER_AUTH_URL` | Yes | App base URL (used for OAuth redirects) |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL (used client-side) |
| `BETTER_AUTH_GOOGLE_CLIENT_ID` | Yes* | Google OAuth client ID |
| `BETTER_AUTH_GOOGLE_CLIENT_SECRET` | Yes* | Google OAuth client secret |
| `CORSAIR_KEK` | Yes | Key-encryption key for Corsair credential storage |
| `CORSAIR_WEBHOOK_URL` | Dev | Override the base URL Corsair uses for webhook registration (use ngrok in local dev) |
| `OPENROUTER_API_KEY` | Yes | Default model provider for the AI agent |
| `INNGEST_SIGNING_KEY` | Prod | Inngest signing key (not needed in local dev) |
| `INNGEST_EVENT_KEY` | Prod | Inngest event key (not needed in local dev) |

*Required to connect Gmail and Google Calendar.

---

## Commands

```bash
pnpm dev                    # start dev server on localhost:3000
pnpm build                  # production build
pnpm lint                   # ESLint

npx prisma migrate dev      # apply pending migrations (creates migration files too)
npx prisma generate         # regenerate Prisma client after schema changes
npx prisma studio           # open browser-based DB explorer at localhost:5555
```

---

## Architecture

### Directory structure

```
app/
  (auth)/           # login, signup pages — no shell
  (shell)/          # authenticated pages wrapped by AppShell
    mail/           # inbox
    calendar/       # calendar views
    agent/          # full-page AI chat
    approvals/      # pending write approvals
    integrations/   # connect/disconnect OAuth integrations
    settings/       # API keys, approval mode, AI tone, email signature
  api/
    agent/chat      # streams AI agent events (NDJSON)
    approvals/      # list + approve/reject Corsair permission requests
    calendar/       # events, action (create/update/delete/rsvp), sync
    corsair/        # callback (OAuth), webhook (push sync)
    mail/           # threads, action, draft, send, search, sync
    realtime/       # SSE stream for sync-status push notifications
    settings/       # read + update UserSettings
    auth/           # better-auth handler

components/
  shell/            # AppShell, sidebar, command palette (⌘K), AI chat float
  mail/             # mail workspace, thread list, compose dialog
  calendar/         # calendar dashboard, week/day/month views, event dialogs
  ui/               # shadcn component library

lib/
  corsair/          # Corsair singleton factory, sync helpers
  modules/          # module registry (nav + command palette auto-wiring)
  workspace-types.ts # shared MailThread, CalendarEvent, etc.

server/
  agent/            # streaming agent runner, tool labeling, system prompt

prisma/
  schema.prisma     # database schema
  migrations/       # migration history

inngest/
  client.ts         # Inngest client + triggerSync helper
  functions.ts      # background sync functions
```

### Key data flows

**Mail and calendar sync**

1. Corsair receives a push webhook from Gmail/Google Calendar
2. `app/api/corsair/webhook` enqueues a sync via Inngest (or directly calls `syncCorsairPlugin` via `after()`)
3. `syncCorsairPlugin` pulls raw entities into `corsair_entities` rows in Postgres
4. `GET /api/mail/threads` and `GET /api/calendar/events` read from `corsair_entities` via Prisma and map to typed responses
5. TanStack Query on the client polls these routes (or invalidates on SSE push)

**AI agent write flow**

1. User sends a message in the AI chat (float or `/agent` page)
2. `POST /api/agent/chat` streams `AgentStreamEvent` (tool_start, tool_done, text) as NDJSON
3. The agent uses Corsair MCP tools: `list_operations`, `get_schema`, `run_script`
4. If `approvalStrict = "writes"` (the default), Corsair intercepts write operations and creates a `corsair_permissions` row, then returns an approval-required message to the agent
5. The agent tells the user to visit `/approvals`
6. User clicks "Approve & run" → `PATCH /api/approvals/:id` → `executePermission` re-runs the stored operation → sync is triggered → UI updates

**Auth**

- better-auth handles session management; the session user ID is also the Corsair `tenantId`
- Google OAuth is shared between better-auth (for user login) and Corsair (for Gmail/Calendar API access)
- `getCurrentSession()` is the server-side session accessor; `authClient` handles client-side session

### Approval modes

Configurable per-user in Settings → AI:

| Mode | Behavior |
|------|----------|
| `writes` (default) | Reads run immediately; writes (send, create, update, delete) require approval |
| `all` | All operations require approval, including reads |
| `never` | All operations run immediately with no approval gate |

---

## Connecting integrations

1. Sign in and navigate to **Integrations**
2. Click **Connect** next to Gmail or Google Calendar
3. Complete the Google OAuth consent screen — grant all requested scopes
4. The integration syncs automatically after connection

In local development, Corsair needs to reach your local server for webhook callbacks. Use [ngrok](https://ngrok.com) and set `CORSAIR_WEBHOOK_URL=https://your-subdomain.ngrok.io` in your `.env.local`.

---

## AI agent setup

The agent uses OpenRouter by default (set `OPENROUTER_API_KEY`). Users can override this in **Settings → API** with their own OpenAI, Anthropic, or OpenRouter key and choose a model (GPT-4o or GPT-4o Mini).

The default model is `openai/gpt-4o-mini` — fast and cheap for daily inbox and calendar tasks.

---

## Database

The schema lives at [prisma/schema.prisma](prisma/schema.prisma). Key tables:

| Table | Purpose |
|-------|---------|
| `user` | User accounts (managed by better-auth) |
| `session` | Auth sessions |
| `account` | OAuth provider links (Google login) |
| `user_settings` | Per-user AI config (API key, approval mode, tone, signature) |
| `corsair_accounts` | Corsair-managed OAuth tokens for Gmail/Calendar |
| `corsair_entities` | Cached mail threads and calendar events (written by sync) |
| `corsair_permissions` | Pending/completed AI write approvals |
| `sync_status` | Per-tenant, per-plugin sync state for SSE notifications |
| `agent_sessions` | Chat history |

---

## Production deployment

1. Set all environment variables listed above (including `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY`)
2. Run `npx prisma migrate deploy` (not `dev`) against your production database
3. Deploy to Vercel, Railway, Render, or any Node.js host
4. Register the Inngest endpoint at `https://your-app.com/api/inngest` in the Inngest dashboard
5. Set `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to your production domain
6. Update your Google OAuth app's authorized redirect URIs to include `https://your-app.com/api/corsair/callback` and `https://your-app.com/api/auth/callback/google`
