import { inngest } from "@/inngest/client"
import { corsairSyncEvents } from "@/inngest/events"
import { ensureCorsairSetup } from "@/lib/corsair/server"
import {
  gmailMailboxes,
  syncGmailMailbox,
  syncCorsairPlugin,
  type GmailMailbox,
  type SyncableCorsairPluginId,
} from "@/lib/corsair/sync"

type SyncEventData = {
  tenantId?: string
  plugin?: SyncableCorsairPluginId
  reason?: string
  mailbox?: GmailMailbox
}

async function runPluginSync(
  tenantId: string,
  plugin: SyncableCorsairPluginId,
  reason?: string | null
) {
  await ensureCorsairSetup(tenantId)
  return syncCorsairPlugin(tenantId, plugin, reason)
}

export const syncGmailCache = inngest.createFunction(
  {
    id: "sync-gmail-cache",
    triggers: { event: corsairSyncEvents.gmail },
  },
  async ({ event, step }) => {
    const { tenantId, mailbox, reason } = event.data as SyncEventData

    if (!tenantId) {
      throw new Error("Missing tenantId for Gmail sync.")
    }

    if (mailbox && gmailMailboxes.includes(mailbox)) {
      return step.run(`sync-gmail-${mailbox}-cache`, () =>
        syncGmailMailbox(tenantId, mailbox, reason)
      )
    }

    return step.run("sync-gmail-cache", () =>
      runPluginSync(tenantId, "gmail", reason)
    )
  }
)

export const syncGoogleCalendarCache = inngest.createFunction(
  {
    id: "sync-google-calendar-cache",
    triggers: { event: corsairSyncEvents.googlecalendar },
  },
  async ({ event, step }) => {
    const { tenantId, reason } = event.data as SyncEventData

    if (!tenantId) {
      throw new Error("Missing tenantId for Google Calendar sync.")
    }

    return step.run("sync-google-calendar-cache", () =>
      runPluginSync(tenantId, "googlecalendar", reason)
    )
  }
)

export const functions = [
  syncGmailCache,
  syncGoogleCalendarCache,
]
