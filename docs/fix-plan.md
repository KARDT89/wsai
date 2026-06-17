WSAI — Simplified Spec Plan (v3, final)
Criteria for a Great Result
Every spec has a concrete pass/fail verify step
Each spec is completable alone — no hidden cross-dependencies
Product test: Connect Gmail. Send yourself a test email. It appears in WSAI within 5 seconds. Ask the AI to archive it — it disappears. No Gmail.com opened.
What's Actually Broken (root-cause analysis)
The sync layer is the problem. lib/corsair-cache.ts (731 lines) tries to map Corsair's corsair_entities DB rows to typed objects, but handles 40+ schema variations and 6-deep fallback chains — because Corsair stores entities in inconsistent formats. This is where sync "doesn't work properly": the data is in the DB but the mapping produces empty arrays or wrong values.

The OAuth flow is slow because after connect, it enqueues to Inngest → user is redirected to /integrations → Inngest must be running → Inngest executes sync → UI eventually updates. Too many moving parts for a 10-user hackathon.

Webhooks never register because ensureCorsairSetup(tenantId) is called without backfill: true, so Google's watch() subscription is never created.

Target Architecture (simple)
OAuth callback → ensureCorsairSetup(tenantId, true) → after(quickSync) → redirect /mail
Gmail push → processWebhook → Corsair updates corsair_entities → after(lightweight resync) → UI refetches
AI action → run_script → Corsair executes + caches result → UI refetches
UI → /api/mail/threads → corsair.gmail.db.threads.search() → response
Delete entirely:

lib/corsair-cache.ts (731 lines of broken mapping)
Inngest sync functions (syncGmailCache, syncGoogleCalendarCache, refreshConnectedWorkspaceCaches)
SyncStatus-related code (no longer needed)
Simplify:

lib/corsair/sync.ts → reduce to one 20-line quickSync function
inngest/functions.ts → remove all sync functions (keep file if other functions exist)
app/api/corsair/callback/route.ts → fix redirect + add after() sync
Spec 1: Fix OAuth Callback (backfill + redirect + background sync)
Why: Three bugs in one file. Missing backfill: true means webhooks never register. Redirecting to /integrations means the user lands away from their data. Using Inngest means sync only works if Inngest dev server is running.

File: app/api/corsair/callback/route.ts

Changes:

// Line 38: add backfill
await ensureCorsairSetup(result.tenantId, true)  // was: ensureCorsairSetup(result.tenantId)

// Replace enqueueCorsairSync with after():
import { after } from 'next/server'
after(() => quickSync(result.tenantId, result.plugin))
// Remove: await enqueueCorsairSync({ ... })

// Redirect to the feature page:
const dest = result.plugin === 'gmail' 
  ? '/mail?connected=1' 
  : result.plugin === 'googlecalendar'
  ? '/calendar?connected=1'
  : `/integrations?connected=${result.plugin}`
return NextResponse.redirect(new URL(dest, request.url))
Also: Add a success toast on /mail and /calendar pages — read ?connected=1 from useSearchParams() and show "Connected — syncing your inbox…"

Verify:

Disconnect Gmail from /integrations
Click "Connect Gmail" — one click through Google OAuth
Land on /mail with "Connected — syncing…" toast
Within 15 seconds: inbox populates with your recent threads
Spec 2: Delete lib/corsair-cache.ts — Replace with Corsair DB Queries
Why: The 731-line mapping layer is broken. Corsair already normalizes entity data internally. corsair.gmail.db.threads.search() returns clean, typed results with no manual mapping needed.

Step 0 — Verify DB ops work (do this before deleting anything): Start the app locally. Open the Agent page. Ask: "Use list_operations for gmail with type 'db' and return the full result." If gmail.db.threads.search appears in the response, the DB ops are available. Proceed. If not, stop this spec and keep lib/corsair-cache.ts — only do Specs 1, 3, 4.

Step 1 — Replace mail threads route:

File: app/api/mail/threads/route.ts

// Instead of: getCachedMailThreadsWithCache(tenantId, mailbox)
// Use:
const corsair = getCorsairInstance().withTenant(tenantId)
const q = mailboxToQuery(mailbox)  // simple map: inbox→"in:inbox", sent→"in:sent", etc.
const result = await corsair.gmail.db.threads.search({ q, maxResults: 50 })
return NextResponse.json({ threads: result.data ?? [] })
Write a thin mapThread() function (~15 lines) to convert Corsair's thread shape to whatever the UI expects. Keep the same response shape ({ threads: MailThread[] }) so the UI doesn't break.

Step 2 — Replace calendar events route:

File: app/api/calendar/events/route.ts

// Instead of: getCachedCalendarEventsWithCache(tenantId)
const corsair = getCorsairInstance().withTenant(tenantId)
const result = await corsair.googlecalendar.db.events.search({ maxResults: 100 })
return NextResponse.json({ events: result.data ?? [] })
Step 3 — Delete lib/corsair-cache.ts (after confirming routes work)

Step 4 — Simplify lib/corsair/sync.ts to just quickSync:

import { getCorsairInstance } from '@/lib/corsair/server'

export async function quickSync(tenantId: string, plugin: string) {
  const corsair = getCorsairInstance().withTenant(tenantId)
  if (plugin === 'gmail') {
    await corsair.gmail.api.threads.list({ maxResults: 50, q: 'in:inbox' })
  } else if (plugin === 'googlecalendar') {
    await corsair.googlecalendar.api.events.getMany({ maxResults: 100 })
  }
  // Corsair auto-caches the API response in corsair_entities
}
Delete everything else in lib/corsair/sync.ts.

Verify:

Open /mail — threads load correctly
Open /calendar — events load correctly
No errors in console about missing types or empty results
Spec 3: Simplify Webhook → Background Sync
Why: Webhook route currently relies on Corsair's webhookHooks to enqueue to Inngest. With Inngest sync functions gone, we need after() as the sync trigger.

File: app/api/corsair/webhook/route.ts

import { after } from 'next/server'
import { quickSync } from '@/lib/corsair/sync'

// After processWebhook():
const result = await processWebhook(getCorsairInstance(), headers, body, query)

if (result.plugin && tenantId) {
  after(() => quickSync(tenantId, result.plugin))
}

return NextResponse.json(result.response ?? { success: true })
Verify:

Send an email to your connected Gmail account
Watch /mail — new thread appears within 5–10 seconds without refresh
Create a Google Calendar event via another client — appears in /calendar within 10 seconds
Spec 4: Remove Inngest Sync Functions
Why: syncGmailCache, syncGoogleCalendarCache, refreshConnectedWorkspaceCaches are replaced by quickSync + after(). No cron needed for 10 users.

File: inngest/functions.ts

Remove all 3 sync functions
If the file is now empty (or only exports functions = []), keep it — Inngest may be needed for future automations
File: inngest/events.ts

Remove corsairSyncEvents if nothing else uses it
File: lib/corsair/server.ts

Remove import { enqueueCorsairSync } from '@/inngest/events'
Remove enqueueWebhookSync function (lines 291–304) — this called enqueueCorsairSync, now handled by after() in the webhook route
Note: The webhookHooks in createCorsairPlugins() can be removed from the plugin config since the webhook route now handles sync directly via after(). Simplify:

// Before: webhookHooks with enqueueWebhookSync
// After: remove webhookHooks entirely — webhook route handles it
const gmailPlugin = withOAuthScopes(gmail({}), [...scopes])
Verify: Search codebase for enqueueCorsairSync — should have 0 references. Inngest dashboard shows no sync functions registered.

Spec 5: AI Prompt — Full Operation List + Zero Hallucination
Why: AI sometimes guesses operation names or parameter shapes. Give it the exact verified list and instructions to get_schema before writes.

File: server/agent/run-agent.ts — buildSystemPrompt()

Add after the existing "Token and latency budget" section:

## Verified Corsair operations for this workspace

Gmail reads (use db when available — fast, cached):
- gmail.db.threads.search({ q: "in:inbox", maxResults: 25 })
- gmail.db.messages.search({ q: "from:name@example.com", maxResults: 25 })
- gmail.db.labels.search({})

Gmail writes (always call get_schema first to verify params):
- gmail.api.messages.send — send email
- gmail.api.drafts.create / drafts.update / drafts.send
- gmail.api.messages.modify({ id, addLabelIds, removeLabelIds })
- gmail.api.messages.trash({ id }) / threads.trash({ id })
- gmail.api.messages.delete({ id }) / threads.delete({ id })
- gmail.api.messages.batchModify({ ids, addLabelIds, removeLabelIds })
- gmail.api.labels.create / labels.update / labels.delete

Calendar reads:
- googlecalendar.db.events.search({ q: "meeting", maxResults: 25 })
- googlecalendar.api.events.getMany({ timeMin, timeMax, maxResults })

Calendar writes (always call get_schema first):
- googlecalendar.api.events.create({ summary, start, end, attendees })
- googlecalendar.api.events.update({ eventId, summary, start, end })
- googlecalendar.api.events.delete({ eventId })
- googlecalendar.api.calendar.getAvailability({ timeMin, timeMax, attendees })

Rules:
- Never guess parameter names. Call get_schema if unsure.
- If run_script returns an error, read it and fix the call — do not retry blindly.
- If an operation says approval required, stop and tell the user to check /approvals.
Also add to labelForCorsairScript():

if (/gmail\.db\.(threads|messages)\.search/.test(code)) return "Searching Gmail"
if (/gmail\.db\.labels\.search/.test(code)) return "Reading labels"
if (/googlecalendar\.db\.events\.search/.test(code)) return "Fetching calendar"
Verify:

Ask: "Find emails from Amazon" → AI uses gmail.db.threads.search (not guessing a different name)
Ask: "Delete the most recent email from spam" → AI calls get_schema before messages.delete
Ask: "Schedule lunch with Alex Tuesday 12pm" → AI creates calendar event with correct params
Spec 6: Default approvalStrict to "never" for New Users
Why: Approvals are optional per user (user confirmed). New users should get auto-execute. Power users enable gating in Settings.

Where new users get settings: Find where UserSettings is created on signup. Could be:

Auth hook in lib/auth.ts
A prisma.userSettings.upsert in the agent chat route
A signup webhook
Change: Set approvalStrict: "never" as the default in UserSettings creation.

File: prisma/schema.prisma — check the UserSettings model default for approvalStrict. If it defaults to "writes", change to "never".

Verify: Sign up with a fresh account → open Agent page → ask "archive the most recent email" → action executes immediately (no approval card, no /approvals visit needed).

Spec 7: @ Mention Email Autocomplete in Compose (New Feature)
Why: User wants to type @ in the compose/reply box and see email address suggestions from their Gmail history.

Step 1 — New API endpoint: app/api/mail/contacts/route.ts

// Query known email addresses from corsair_entities (From/To headers of synced threads)
GET /api/mail/contacts?q=john
→ [{ name: "John Smith", email: "john@example.com" }]
Query: search corsair_entities for thread entities, extract From/To headers, dedupe, filter by q.

Step 2 — Find compose component: Read the reply composer in components/mail/mail-workspace.tsx or wherever the compose textarea lives. Find the input element for the "To" field.

Step 3 — Add @ trigger: When user types @ or types in the To field, call /api/mail/contacts?q=<typed> and show a dropdown. On select, insert Name <email@example.com>.

Use an existing shadcn Popover + Command pattern (already in the project).

Verify: Open a compose window, type @ → dropdown appears with email suggestions from your Gmail history → select one → email address inserted into To field.

Build Order
Spec 1 (OAuth fix)           5 min  — highest impact, unblocks everything
Spec 3 (webhook sync)       10 min  — depends on quickSync from Spec 2
Spec 2 (delete cache layer) 45 min  — verify DB ops first, then delete
Spec 4 (remove Inngest sync) 10 min  — after Spec 2 confirmed working
Spec 5 (AI prompt)          20 min  — independent
Spec 6 (default no approval) 10 min  — independent
Spec 7 (@ mention)          60 min  — independent, lowest priority
Critical path: Spec 1 → disconnect/reconnect Gmail → test real-time webhook → Spec 3 → Spec 2 → Spec 4

The single most important action: After Spec 1 lands, disconnect and reconnect Gmail from /integrations. This calls the updated callback with backfill: true, which registers the Google push subscription. Nothing else matters until this is done.