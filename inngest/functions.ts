import { inngest } from "@/inngest/client"
import { syncCorsairPlugin } from "@/lib/corsair/sync"

type SyncEventData = { tenantId: string; reason?: string }

export const syncGmail = inngest.createFunction(
  {
    id: "sync-gmail",
    retries: 4,
    triggers: [{ event: "corsair/gmail.sync.requested" }],
  },
  async ({ event }: { event: { data: SyncEventData } }) => {
    return syncCorsairPlugin(event.data.tenantId, "gmail", event.data.reason)
  }
)

export const syncCalendar = inngest.createFunction(
  {
    id: "sync-calendar",
    retries: 4,
    triggers: [{ event: "corsair/calendar.sync.requested" }],
  },
  async ({ event }: { event: { data: SyncEventData } }) => {
    return syncCorsairPlugin(event.data.tenantId, "googlecalendar", event.data.reason)
  }
)

export const functions = [syncGmail, syncCalendar]
