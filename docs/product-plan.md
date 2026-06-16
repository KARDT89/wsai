# Founder Command Center — Product Plan

## What This Is

A Superhuman-style operating cockpit for founders. Gmail + Google Calendar triage as the first complete surface. GitHub, Slack, Linear as subsequent modules. All integration work goes through Corsair. No direct third-party API calls from app code.

**Stack:** Next.js 16 (App Router), Prisma, BetterAuth, Inngest, Corsair (`@corsair-dev/app`), OpenAI SDK.
**No tRPC.** All server communication via Next.js Route Handlers (`app/api/`).

---

## Route Handler API Design (No tRPC)

Every data flow follows one of three patterns. The route handler is the boundary; nothing client-side talks to Corsair or external services directly.

### Read feeds (DB path)

```
GET /api/integrations/[plugin]/[entity]?tenantId=&cursor=&limit=
```

Handler calls `tenant.run("gmail.db.threads.search", ...)`. Returns JSON. Client uses SWR or TanStack Query for polling and cache.

### Refresh / write (API path)

```
POST /api/integrations/[plugin]/[entity]/[action]
Body: { tenantId, ...operationInput }
```

Handler calls `tenant.run("gmail.api.messages.send", ...)`. Returns `{ success, data?, signInLink? }`. Client handles `signInLink` redirect for missing auth.

### Triage

```
GET /api/triage?tenantId=
POST /api/triage/[itemId]/action
Body: { action: "archive" | "snooze" | "reply" | "mark_done", ... }
```

Triage reads from Prisma projections, not live Corsair every time. Actions go through approval gating before writing.

### Agent

```
POST /api/agent/chat
Body: { tenantId, sessionId, message, history }

POST /api/agent/approve
Body: { tenantId, approvalId, decision: "approve" | "reject" }
```

Agent handler builds Corsair MCP client for the tenant, runs OpenAI with MCP tools, intercepts any write tool call and creates an `ApprovalRequest` instead of executing.

### Corsair Connect

```
GET /api/corsair/connect?tenantId=
```

Calls `tenant.connectLink.create()` and redirects the user to it.

### Webhooks

```
POST /api/webhooks/corsair
```

Single endpoint. Corsair `processWebhook` handles signature verification and routing. Handler dispatches to the right Inngest event.

### Auth (BetterAuth)

```
/api/auth/[...betterauth]
```

Standard BetterAuth catch-all. Tenant ID = BetterAuth user ID or org ID depending on model chosen.

---

## Corsair Integration Layer

### Setup

```ts
// src/server/corsair/client.ts
import { createClient } from "@corsair-dev/app";

export const corsair = createClient({
  apiKey: process.env.CORSAIR_DEV_KEY!,
});

export const instance = corsair.instance(process.env.CORSAIR_INSTANCE_ID!);

export function tenant(tenantId: string) {
  return instance.tenant(tenantId);
}
```

### Operation modes

| Situation | Call |
|---|---|
| UI feed, list, search | `tenant.run("plugin.db.entity.search", input)` |
| User clicks Refresh | `tenant.run("plugin.api.entity.list", input)` |
| Write (send, create, update, delete) | `tenant.run("plugin.api.entity.action", input)` — only after approval |
| Missing auth discovered at runtime | Redirect to `result.signInLink` |
| Proactive connect prompt | `tenant.connectLink.create()` |

### MCP (Agent)

```ts
// src/server/corsair/mcp.ts
import { instance } from "./client";

export async function getCorsairMcpTools(tenantId: string) {
  const t = instance.tenant(tenantId);
  // Returns Vercel AI SDK-compatible tool set
  return t.mcp.createVercelClient();
}
```

---

## Module Architecture

Every integration is a module. Core services never import from a specific integration; they call the registry.

```ts
// src/server/integrations/types.ts
export interface IntegrationModule {
  id: string;                       // "gmail" | "googlecalendar" | "github" | "slack"
  label: string;
  icon: string;
  dbOps: string[];                  // corsair db paths this module reads
  apiOps: string[];                 // corsair api paths this module writes
  approvalRequired: string[];       // api paths that need explicit approval before execution
  webhookEvents: string[];          // corsair event types this module handles
  buildProjections: (payload: unknown) => Promise<void>;
  triageSignals: (tenantId: string) => Promise<TriageItem[]>;
}
```

```
src/server/integrations/
  registry.ts
  types.ts
  gmail/
    index.ts
    projections.ts
    triage.ts
  calendar/
    index.ts
    projections.ts
    triage.ts
  github/         ← add later, same contract
  slack/          ← add later, same contract
```

---

## Prisma Schema (key tables)

```prisma
model TenantConnection {
  id        String   @id @default(cuid())
  tenantId  String
  plugin    String
  connected Boolean  @default(false)
  createdAt DateTime @default(now())

  @@unique([tenantId, plugin])
}

model EmailThread {
  id           String   @id @default(cuid())
  tenantId     String
  corsairId    String   @unique
  subject      String
  from         String
  snippet      String
  labelIds     String[]
  isUnread     Boolean
  hasAttachment Boolean
  lastMessageAt DateTime
  updatedAt    DateTime @updatedAt
}

model CalendarEvent {
  id           String   @id @default(cuid())
  tenantId     String
  corsairId    String   @unique
  title        String
  startAt      DateTime
  endAt        DateTime
  attendees    Json
  meetingLink  String?
  needsPrep    Boolean  @default(false)
  updatedAt    DateTime @updatedAt
}

model TriageItem {
  id           String   @id @default(cuid())
  tenantId     String
  lane         String   // "now" | "waiting" | "today" | "low"
  sourceType   String   // "email" | "event" | "github_pr" | "slack_mention"
  sourceId     String
  reason       String   // AI-generated explanation
  suggestedAction String
  resolvedAt   DateTime?
  createdAt    DateTime @default(now())
}

model ApprovalRequest {
  id           String   @id @default(cuid())
  tenantId     String
  agentSessionId String
  plugin       String
  operation    String
  input        Json
  status       String   @default("pending") // "pending" | "approved" | "rejected"
  decidedAt    DateTime?
  createdAt    DateTime @default(now())
}

model AgentSession {
  id        String   @id @default(cuid())
  tenantId  String
  messages  Json     @default("[]")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model AutomationRule {
  id          String   @id @default(cuid())
  tenantId    String
  trigger     Json     // { plugin, event, filter }
  actions     Json     // [{ plugin, operation, input }]
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
}

model WebhookIngestion {
  id         String   @id @default(cuid())
  tenantId   String
  plugin     String
  eventType  String
  payload    Json
  processedAt DateTime?
  createdAt  DateTime @default(now())
}
```

---

## Inngest Functions

Inngest replaces background jobs, polling, and projection rebuilds. No cron in Next.js.

```
inngest/
  functions/
    gmail.sync.ts           // triggered by webhook or manual refresh
    calendar.sync.ts
    triage.rebuild.ts       // runs after any sync completes
    approval.timeout.ts     // expire pending approvals after N minutes
    automation.run.ts       // execute approved automation rules
```

### Key events

| Inngest Event | Triggered by | Handler |
|---|---|---|
| `corsair/gmail.message.received` | Webhook → Route Handler | `gmail.sync.ts` → upsert EmailThread, queue triage rebuild |
| `corsair/calendar.event.updated` | Webhook → Route Handler | `calendar.sync.ts` → upsert CalendarEvent |
| `app/triage.rebuild` | After any sync | `triage.rebuild.ts` → score items, write TriageItems |
| `app/approval.created` | Agent creates ApprovalRequest | `approval.timeout.ts` → expire after 10min |
| `app/automation.trigger` | Webhook matches an AutomationRule | `automation.run.ts` → execute with approval gate |

### Webhook → Inngest bridge

```ts
// src/app/api/webhooks/corsair/route.ts
import { processWebhook } from "@corsair-dev/app";
import { inngest } from "@/server/inngest/client";

export async function POST(req: Request) {
  const body = await req.json();
  const headers = Object.fromEntries(req.headers);

  const webhook = await processWebhook(instance, headers, body);

  // Forward to Inngest for async processing
  await inngest.send({
    name: `corsair/${webhook.plugin}.${webhook.event}`,
    data: { tenantId: webhook.tenantId, payload: webhook.data },
  });

  return Response.json(webhook.response);
}
```

---

## AI Agent

OpenAI SDK + Corsair MCP tools. No hardcoded operation names.

```ts
// src/server/agent/run.ts
import OpenAI from "openai";
import { getCorsairMcpTools } from "@/server/corsair/mcp";
import { db } from "@/server/db";

const openai = new OpenAI();

export async function runAgentTurn(
  tenantId: string,
  sessionId: string,
  userMessage: string,
  history: OpenAI.Chat.ChatCompletionMessageParam[]
) {
  const mcpTools = await getCorsairMcpTools(tenantId);

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_AGENT_MODEL!,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      ...history,
      { role: "user", content: userMessage },
    ],
    tools: mcpTools,
  });

  // Intercept write tool calls → create ApprovalRequest instead of executing
  for (const call of response.choices[0].message.tool_calls ?? []) {
    if (isWriteOperation(call.function.name)) {
      await db.approvalRequest.create({
        data: {
          tenantId,
          agentSessionId: sessionId,
          plugin: pluginFromOp(call.function.name),
          operation: call.function.name,
          input: JSON.parse(call.function.arguments),
        },
      });
      // Return gated response to UI
      return { type: "approval_required", callId: call.id };
    }
  }

  return { type: "message", content: response.choices[0].message.content };
}
```

Write operations that always require approval: `send`, `post`, `create`, `update`, `delete`, `archive`, `trash`, `invite`, `reply`.

---

## Project Structure

```
src/
  app/
    api/
      auth/[...betterauth]/route.ts
      integrations/[plugin]/[entity]/route.ts
      integrations/[plugin]/[entity]/[action]/route.ts
      triage/route.ts
      triage/[itemId]/action/route.ts
      agent/chat/route.ts
      agent/approve/route.ts
      corsair/connect/route.ts
      webhooks/corsair/route.ts
    (app)/
      cockpit/page.tsx           ← Triage Cockpit
      mail/[threadId]/page.tsx
      calendar/page.tsx
      approvals/page.tsx
      automations/page.tsx
      integrations/page.tsx
      agent/page.tsx
  server/
    corsair/
      client.ts
      mcp.ts
    integrations/
      registry.ts
      types.ts
      gmail/
      calendar/
      github/
      slack/
    agent/
      run.ts
      system-prompt.ts
      approvals.ts
    inngest/
      client.ts
      functions/
    db.ts                        ← Prisma client singleton
  components/
    cockpit/
    mail/
    calendar/
    agent/
    approvals/
    command-palette/
```

---

## Environment Variables

```env
# App
DATABASE_URL=
NEXT_PUBLIC_APP_URL=

# BetterAuth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
BETTER_AUTH_GITHUB_CLIENT_ID=
BETTER_AUTH_GITHUB_CLIENT_SECRET=

# Corsair
CORSAIR_DEV_KEY=
CORSAIR_INSTANCE_ID=
CORSAIR_WEBHOOK_SECRET=

# OpenAI
OPENAI_API_KEY=
OPENAI_AGENT_MODEL=gpt-4o
OPENAI_CLASSIFIER_MODEL=gpt-4o-mini

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

---

## Implementation Order

1. Prisma schema — all tables above, run migration.
2. BetterAuth setup — catch-all route handler, session middleware.
3. Corsair client — `src/server/corsair/client.ts`, connect link route, missing-auth handling.
4. Webhook route — single `/api/webhooks/corsair` endpoint, Inngest bridge.
5. Inngest client and function stubs — `gmail.sync`, `calendar.sync`, `triage.rebuild`.
6. Gmail module — projections (EmailThread), triage signals, read route handler.
7. Calendar module — projections (CalendarEvent), triage signals, read route handler.
8. Triage Cockpit — page reads from Prisma, four lanes, keyboard nav.
9. Agent route handler — OpenAI + MCP tools, approval gating.
10. Approvals page — list pending, approve/reject route handler.
11. Command palette — global keyboard shortcut, searches threads/events/actions.
12. GitHub module — add to registry, same contract, new route handlers.
13. Slack module — same.
14. Automations — AutomationRule CRUD, Inngest execution function.

---

## What You Are NOT Building

- Direct Gmail API, Google Calendar API, GitHub API, or Slack API calls from your code. Corsair is the only integration path.
- tRPC. Every API surface is a Next.js Route Handler.
- A polling loop. Inngest + Corsair webhooks handle all data freshness.
- Per-module webhook endpoints. One `/api/webhooks/corsair` dispatches everything.

---

