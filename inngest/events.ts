import { inngest } from "@/inngest/client"
import type { SyncableCorsairPluginId } from "@/lib/corsair/sync"

export const corsairSyncEvents = {
  gmail: "wsai/gmail.sync.requested",
  googlecalendar: "wsai/googlecalendar.sync.requested",
} as const satisfies Record<SyncableCorsairPluginId, string>

export type CorsairSyncReason =
  | "manual"
  | "oauth_callback"
  | "corsair_webhook"
  | "scheduled"

export async function enqueueCorsairSync({
  tenantId,
  plugin,
  reason,
}: {
  tenantId: string
  plugin: SyncableCorsairPluginId
  reason: CorsairSyncReason
}) {
  return inngest.send({
    name: corsairSyncEvents[plugin],
    data: {
      tenantId,
      plugin,
      reason,
    },
  })
}
