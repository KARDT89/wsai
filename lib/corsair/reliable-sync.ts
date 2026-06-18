import { inngest } from "@/inngest/client"
import { syncCorsairPlugin, type SyncableCorsairPluginId } from "@/lib/corsair/sync"
import {
  markSyncFailed,
  markSyncSucceeded,
  type SyncStatusMetadata,
} from "@/lib/sync-status"

type ReliableSyncReason = "webhook" | "user_action" | "approval" | "manual" | string

type ReliableSyncOptions = {
  tenantId: string
  plugin: SyncableCorsairPluginId
  reason: ReliableSyncReason
  inlineFallback?: boolean
  enqueue?: boolean
}

type ReliableSyncResult = {
  plugin: SyncableCorsairPluginId
  enqueued: boolean
  inline: boolean
  synced?: number
}

const SYNC_EVENT_NAMES: Record<SyncableCorsairPluginId, string> = {
  gmail: "corsair/gmail.sync.requested",
  googlecalendar: "corsair/calendar.sync.requested",
}

export function shouldRunInlineSyncFallback() {
  if (process.env.CORSAIR_SYNC_INLINE_FALLBACK === "true") return true
  if (process.env.CORSAIR_SYNC_INLINE_FALLBACK === "false") return false
  return process.env.NODE_ENV !== "production"
}

export async function requestReliableSync({
  tenantId,
  plugin,
  reason,
  inlineFallback = shouldRunInlineSyncFallback(),
  enqueue = true,
}: ReliableSyncOptions): Promise<ReliableSyncResult> {
  let enqueued = false

  if (enqueue) {
    try {
      await inngest.send({
        name: SYNC_EVENT_NAMES[plugin],
        data: { tenantId, reason },
      })
      enqueued = true
    } catch (error) {
      await persistSyncDispatchFailure({ tenantId, plugin, reason, error })
    }
  }

  if (inlineFallback) {
    const result = await syncCorsairPlugin(tenantId, plugin, reason)
    return {
      plugin,
      enqueued,
      inline: true,
      synced: result.synced,
    }
  }

  return {
    plugin,
    enqueued,
    inline: false,
  }
}

export async function markWebhookAccepted({
  tenantId,
  plugin,
}: {
  tenantId: string
  plugin: SyncableCorsairPluginId
}) {
  await markSyncSucceeded({
    tenantId,
    plugin,
    scope: "webhook",
    reason: "webhook",
    itemCount: 0,
  })

  // The Corsair webhook handler has already updated the local entity cache for
  // matched events. Mark the plugin scope successful so SSE clients refetch fast,
  // while the reliable sync path follows up with a fuller reconciliation.
  await markSyncSucceeded({
    tenantId,
    plugin,
    reason: "webhook",
    itemCount: 0,
  })
}

export function logReliableSyncFailure(context: string) {
  return (error: unknown) => {
    console.error(`[reliable-sync] ${context}:`, error)
  }
}

async function persistSyncDispatchFailure({
  tenantId,
  plugin,
  reason,
  error,
}: {
  tenantId: string
  plugin: SyncableCorsairPluginId
  reason: ReliableSyncReason
  error: unknown
}) {
  console.error(`[reliable-sync] Failed to enqueue ${plugin} sync:`, error)

  await markSyncFailed({
    tenantId,
    plugin,
    reason,
    error,
  })
}

export type { ReliableSyncResult, SyncStatusMetadata }
