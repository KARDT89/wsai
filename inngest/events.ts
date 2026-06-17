import { inngest } from "@/inngest/client"
import type { GmailMailbox, SyncableCorsairPluginId } from "@/lib/corsair/sync"

export const corsairSyncEvents = {
  gmail: "wsai/gmail.sync.requested",
  googlecalendar: "wsai/googlecalendar.sync.requested",
} as const satisfies Record<SyncableCorsairPluginId, string>

export type CorsairSyncReason =
  | "manual"
  | "user_action"
  | "oauth_callback"
  | "corsair_webhook"
  | "agent_action"
  | "stale_cache"
  | "scheduled"

export async function enqueueCorsairSync({
  tenantId,
  plugin,
  reason,
  mailbox,
}: {
  tenantId: string
  plugin: SyncableCorsairPluginId
  reason: CorsairSyncReason
  mailbox?: GmailMailbox
}) {
  return inngest.send({
    name: corsairSyncEvents[plugin],
    data: {
      tenantId,
      plugin,
      reason,
      mailbox,
    },
  })
}
