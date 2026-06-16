# WSAI — Workspace AI Product Plan

## Core Idea

WSAI is a workspace that replaces Gmail and Google Calendar in the browser.

The user should not need to open Gmail, Calendar, or a separate AI tool. Mail, calendar, search, commands, approvals, and AI chat all live inside one interface.

The product feels like a Gmail clone first, with AI woven into the workflow.

Example commands:

- “Summarize this email thread.”
- “Reply saying I’ll join at 3 PM.”
- “Find all emails about the Q2 budget and summarize them.”
- “Schedule 30 minutes with Alex next Tuesday morning.”
- “Archive all newsletters from last week.”

AI can prepare actions, but important write actions require user approval before execution.

---

## Product Philosophy

The key design principle:

> The user does everything in one window.

WSAI is not a triage dashboard. It is not a separate AI agent page with mail features attached.

It is:

- Gmail-style mail UI
- Google Calendar-style calendar UI
- AI command layer on top
- Settings and integrations hub
- Approval system for safe AI actions
- Modular architecture for future GitHub, Slack, Linear, and other integrations

---

## Main App Structure

```txt
/app
  /mail
  /calendar
  /agent
  /approvals
  /settings
  /integrations
```

The shell stays mounted across the app.

```txt
Shell
├── Left Sidebar
├── Top Bar
├── Main Content Area
├── Command Palette
└── Floating AI Drawer
```

---

## Permanent Shell

The shell wraps every module and owns the persistent UI.

### Left Sidebar

Sections:

- Mail
- Calendar
- Agent
- Approvals
- Settings
- Integrations

Future sections:

- GitHub
- Slack
- Linear

The AI chat icon sits near the bottom and opens the floating AI drawer.

### Top Bar

The top bar contains:

- Current section name
- Global search
- Contextual compose button

Examples:

- In Mail: `Compose Email`
- In Calendar: `New Event`
- In GitHub later: `New Issue` or `Search PRs`

### Command Palette

Shortcut: `Cmd/Ctrl + K`

The command palette accepts both structured and natural language commands.

It shows results in buckets:

- Actions
- Search results
- Navigation
- AI commands

Examples:

- “Reply to Sarah”
- “Schedule meeting with Alex”
- “Go to sent mail”
- “Find unread emails from yesterday”
- “Summarize this thread”

Commands that write data go through the approval gate.

### Floating AI Drawer

The AI drawer slides in from the right as an overlay.

It does not replace the current page.

It knows the active context:

- If opened inside a mail thread, it receives that thread as context.
- If opened inside a calendar event, it receives event details and attendees.
- If opened inside the inbox, it receives selected thread or current filters.

At the top, show a context chip:

```txt
Context: Thread from Sarah
```

or

```txt
Context: Calendar event with Alex
```

---

## Mail Module — Phase 1

The mail module is the main product surface.

It should feel like a Gmail clone, not a generic dashboard. Humanity has suffered enough dashboards already.

### Layout

Three-pane layout:

```txt
Mail Label Sidebar | Thread List | Thread Detail
```

### Left Pane — Labels/Folders

Includes:

- Inbox
- Sent
- Drafts
- Starred
- Snoozed
- Spam
- Trash
- All Mail
- Custom labels
- New label button

### Middle Pane — Thread List

Each thread row shows:

- Sender
- Subject
- Snippet
- Timestamp
- Unread indicator
- Attachment indicator
- Label chips
- Star button

Keyboard shortcuts:

- `j` = next thread
- `k` = previous thread
- `Enter` = open selected thread
- `e` = archive
- `r` = reply
- `/` = search

### Right Pane — Thread Detail

Shows full conversation.

Features:

- Messages in chronological order
- Expanded/collapsed message cards
- Reply composer inline at bottom
- Rich text formatting toolbar
- Attachments
- Thread actions

### Thread Actions

Direct user clicks execute immediately:

- Archive
- Delete
- Snooze
- Mark read/unread
- Add label
- Move to folder
- Star/unstar
- Reply
- Forward

AI-triggered write actions require approval.

### Compose Flow

Compose can appear as:

- Full-screen modal
- Floating modal
- Inline reply composer

Fields:

- To
- CC
- BCC
- Subject
- Body
- Attachments
- Signature

AI can pre-fill the draft, but the user approves sending.

### Mail Data Flow

```txt
Corsair Gmail Webhook
  → /api/webhooks/corsair
  → Inngest mail.sync
  → Prisma EmailThread
  → GET /api/mail/threads
  → Mail UI
```

Manual refresh:

```txt
POST /api/mail/threads/sync
  → Corsair Gmail API path
  → Update Prisma
```

---

## Calendar Module — Phase 1

The calendar module should feel like Google Calendar inside WSAI.

### Views

- Week view default
- Day view
- Month view

### Main Calendar Grid

Features:

- Time-blocked events
- Calendar color coding
- Click time slot to create event
- Click event to open details
- Drag/reschedule later if time allows

### Calendar Sidebar

Includes:

- Mini month picker
- My Calendars list
- Calendar toggles
- Upcoming events list
- New Event button

### Event Detail Panel

Shows:

- Title
- Date/time
- Location
- Attendees
- RSVP status
- Meeting link
- Description
- Calendar source

### New Event Flow

Modal fields:

- Title
- Date
- Start time
- End time
- Guests
- Location
- Description
- Meeting link toggle
- Calendar picker

AI can create an event draft from commands such as:

```txt
Schedule 30 minutes with Alex next Tuesday morning.
```

Creating or modifying events through AI requires approval.

### Calendar Data Flow

```txt
Corsair Calendar Webhook
  → /api/webhooks/corsair
  → Inngest calendar.sync
  → Prisma CalendarEvent
  → GET /api/calendar/events
  → Calendar UI
```

---

## AI Layer

There are three AI surfaces, but one backend.

All AI surfaces call:

```txt
POST /api/agent/chat
```

### 1. Floating AI Drawer

Used for quick context-aware actions.

Examples:

- “Summarize this.”
- “Draft a polite reply.”
- “What is this person asking me to do?”
- “Turn this email into a calendar event.”

### 2. Command Palette

Used for fast keyboard-first commands.

Examples:

- “Find emails from Nikhil about invoice.”
- “Reply to selected email.”
- “Schedule this meeting.”
- “Archive newsletters.”

### 3. Agent Page

Used for longer multi-step workflows.

Examples:

- “Go through my unread emails, draft replies to anything important, and list what needs action.”
- “Find all meetings this week and tell me what I need to prepare.”
- “Summarize my work communication from last week.”

The Agent page stores full conversation history in `AgentSession`.

---

## Approval Gate

The AI never silently performs risky write operations.

Write operations requiring approval:

- Send email
- Reply to email
- Forward email
- Archive thread
- Delete thread
- Create event
- Update event
- Delete event
- Invite attendees
- Post to external services
- Create/update/delete records in future modules

Flow:

```txt
AI proposes action
  → Create ApprovalRequest
  → Show approval card
  → User approves or rejects
  → Approved action runs through Corsair API path
```

Pending approvals show as a badge in the sidebar.

---

## Settings / Integrations

This is the dashboard equivalent.

Not a triage cockpit. Not a mission-control cosplay panel. Just the place where setup happens.

### Integrations Tab

Cards for:

- Gmail
- Google Calendar
- GitHub later
- Slack later
- Linear later

Each card shows:

- Connected status
- Last synced
- Connect/Reconnect button
- Disconnect option
- Sync now button

Connect flow:

```txt
GET /api/corsair/connect?tenantId=
  → Corsair OAuth connect link
  → Redirect user
```

### Account Tab

Includes:

- Profile
- Email
- Password/session management through BetterAuth
- Team members later

### Preferences Tab

Includes:

- Email signature
- Default calendar
- Notification settings
- Default AI reply tone
- Approval strictness

### Automations Tab — Phase 2

Rule builder examples:

```txt
When I receive an email from @company.com, label it Client.
```

```txt
When a calendar invite has no meeting link, remind me before the event.
```

```txt
When GitHub PR is assigned to me, add it to my priority list.
```

---

## Backend Architecture

### Stack

- Next.js App Router
- TypeScript
- Prisma
- BetterAuth
- Corsair
- Inngest
- OpenAI SDK
- shadcn/ui
- Tailwind CSS

No tRPC.

All server communication uses Next.js Route Handlers.

---

## API Routes

```txt
src/app/api/
  auth/[...betterauth]/route.ts

  corsair/connect/route.ts
  webhooks/corsair/route.ts

  mail/threads/route.ts
  mail/threads/[id]/route.ts
  mail/threads/[id]/[action]/route.ts
  mail/compose/route.ts

  calendar/events/route.ts
  calendar/events/[id]/route.ts

  agent/chat/route.ts
  agent/approve/route.ts

  approvals/route.ts
  approvals/[id]/route.ts

  settings/integrations/route.ts
```

---

## Prisma Models

Core tables:

- User/Auth tables from BetterAuth
- TenantConnection
- EmailThread
- EmailMessage
- CalendarEvent
- ApprovalRequest
- AgentSession
- AutomationRule
- WebhookIngestion

### TenantConnection

Tracks which integrations are connected.

```prisma
model TenantConnection {
  id        String   @id @default(cuid())
  tenantId  String
  plugin    String
  connected Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, plugin])
}
```

### EmailThread

Stores Gmail thread projections.

```prisma
model EmailThread {
  id            String   @id @default(cuid())
  tenantId      String
  corsairId     String   @unique
  subject       String
  from          String
  snippet       String
  labelIds      String[]
  isUnread      Boolean
  hasAttachment Boolean
  lastMessageAt DateTime
  updatedAt     DateTime @updatedAt
}
```

### CalendarEvent

Stores Google Calendar event projections.

```prisma
model CalendarEvent {
  id          String   @id @default(cuid())
  tenantId    String
  corsairId   String   @unique
  title       String
  startAt     DateTime
  endAt       DateTime
  attendees   Json
  meetingLink String?
  description String?
  location    String?
  updatedAt   DateTime @updatedAt
}
```

### ApprovalRequest

Stores AI-proposed write actions.

```prisma
model ApprovalRequest {
  id             String   @id @default(cuid())
  tenantId       String
  agentSessionId String?
  plugin         String
  operation      String
  input          Json
  status         String   @default("pending")
  decidedAt      DateTime?
  createdAt      DateTime @default(now())
}
```

### AgentSession

Stores long-running AI conversations.

```prisma
model AgentSession {
  id        String   @id @default(cuid())
  tenantId  String
  messages  Json     @default("[]")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## Module Contract

Every integration should follow the same module contract.

```ts
export interface WSAIModule {
  id: "mail" | "calendar" | "github" | "slack"
  label: string
  icon: string
  navPosition: number
  page: React.ComponentType
  commandPaletteActions: () => Action[]
  agentContextForItem: (itemId: string) => Promise<string>
  dbOps: string[]
  apiOps: string[]
  approvalRequired: string[]
  webhookEvents: string[]
  buildProjections: (payload: unknown) => Promise<void>
}
```

When adding GitHub later:

1. Add Prisma tables like `GithubPR` and `GithubIssue`.
2. Create GitHub module folder.
3. Implement the `WSAIModule` contract.
4. Add Inngest sync functions.
5. Register the module in `src/server/modules/registry.ts`.
6. Build a GitHub page UI.

The shell should pick it up without major rewrites.

---

## File Structure

```txt
src/
  app/
    api/
      auth/[...betterauth]/route.ts
      corsair/connect/route.ts
      webhooks/corsair/route.ts
      mail/threads/route.ts
      mail/threads/[id]/route.ts
      mail/threads/[id]/[action]/route.ts
      mail/compose/route.ts
      calendar/events/route.ts
      calendar/events/[id]/route.ts
      agent/chat/route.ts
      agent/approve/route.ts
      approvals/route.ts
      approvals/[id]/route.ts
      settings/integrations/route.ts

    (shell)/
      layout.tsx
      mail/page.tsx
      calendar/page.tsx
      agent/page.tsx
      approvals/page.tsx
      settings/page.tsx

  components/
    shell/
      sidebar.tsx
      topbar.tsx
      command-palette.tsx
      ai-drawer.tsx

    mail/
      label-sidebar.tsx
      thread-list.tsx
      thread-detail.tsx
      composer.tsx

    calendar/
      calendar-sidebar.tsx
      mini-calendar.tsx
      week-grid.tsx
      month-grid.tsx
      event-modal.tsx

    agent/
      chat-thread.tsx
      approval-card.tsx
      context-chip.tsx

    settings/
      integration-card.tsx

  server/
    db.ts

    corsair/
      client.ts
      mcp.ts

    agent/
      run.ts
      system-prompt.ts
      approvals.ts

    modules/
      registry.ts
      types.ts
      mail/
      calendar/
      github/
      slack/

    inngest/
      client.ts
      functions/
        mail.sync.ts
        calendar.sync.ts
        approval.timeout.ts
        automation.run.ts
```

---

## Implementation Order

### Phase 0 — Foundation

1. Create Next.js app structure.
2. Install shadcn/ui.
3. Set up Tailwind base theme.
4. Set up Prisma.
5. Set up BetterAuth.
6. Create protected shell layout.

### Phase 1 — Corsair + Settings

1. Create Corsair client singleton.
2. Add `/api/corsair/connect` route.
3. Create Settings page.
4. Create Integration cards.
5. Show connected/not connected state.
6. Add reconnect button.

### Phase 2 — Mail Backend

1. Add `EmailThread` schema.
2. Add mail sync Inngest function.
3. Add Corsair webhook route.
4. Upsert email projections into Prisma.
5. Add `GET /api/mail/threads`.
6. Add `GET /api/mail/threads/[id]`.
7. Add mail action route.

### Phase 3 — Mail UI

1. Build Gmail-like shell.
2. Build label sidebar.
3. Build thread list.
4. Build thread detail view.
5. Build inline reply composer.
6. Add keyboard navigation.
7. Add archive/delete/snooze/read actions.

### Phase 4 — Calendar Backend

1. Add `CalendarEvent` schema.
2. Add calendar sync Inngest function.
3. Upsert calendar projections.
4. Add `GET /api/calendar/events`.
5. Add event detail route.
6. Add create/update event actions.

### Phase 5 — Calendar UI

1. Build week view.
2. Build day/month toggles.
3. Build mini calendar.
4. Build event modal.
5. Build new event flow.
6. Add calendar sidebar.

### Phase 6 — AI Drawer

1. Create floating AI drawer.
2. Add context chip.
3. Inject selected thread/event context.
4. Call `/api/agent/chat`.
5. Render AI responses.
6. Render draft suggestions.

### Phase 7 — Approval System

1. Add `ApprovalRequest` schema.
2. Intercept AI write operations.
3. Create approval cards.
4. Build Approvals page.
5. Add approve/reject routes.
6. Execute approved actions through Corsair.

### Phase 8 — Command Palette

1. Add `Cmd/Ctrl + K` shortcut.
2. Add navigation commands.
3. Add search commands.
4. Add selected-item commands.
5. Add AI-driven commands.
6. Send write commands through approval gate.

### Phase 9 — Agent Page

1. Build full-page chat UI.
2. Add AgentSession persistence.
3. Support multi-turn tasks.
4. Show approval cards inline.
5. Allow user to continue from previous task.

### Phase 10 — Future Modules

1. GitHub module.
2. Slack module.
3. Linear module.
4. Automations builder.
5. Cross-module search.
6. Cross-module summaries.

---

## MVP Scope

The first MVP should include:

- Auth
- Corsair connect flow
- Settings integrations page
- Gmail-style inbox
- Thread detail page
- Inline reply composer
- Calendar week view
- Floating AI drawer
- AI thread summarization
- AI draft reply
- Approval before send

Do not build first:

- GitHub
- Slack
- Automations
- Full triage system
- Overcomplicated dashboards
- Beautiful but useless analytics cards

Those can come later, after the app actually does the job. Radical concept.

---

## Final Product Sentence

WSAI is a Gmail and Calendar replacement with an AI command layer that lets users read, search, summarize, reply, schedule, and automate work from one unified workspace.
