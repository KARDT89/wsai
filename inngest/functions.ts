import { inngest } from "@/inngest/client"
import { corsairSyncEvents } from "@/inngest/events"
import { ensureCorsairSetup } from "@/lib/corsair/server"
import {
  listConnectedSyncTargets,
  syncCorsairPlugin,
  type SyncableCorsairPluginId,
} from "@/lib/corsair/sync"

type SyncEventData = {
  tenantId?: string
  plugin?: SyncableCorsairPluginId
  reason?: string
}

async function runPluginSync(
  tenantId: string,
  plugin: SyncableCorsairPluginId
) {
  await ensureCorsairSetup(tenantId)
  return syncCorsairPlugin(tenantId, plugin)
}

export const syncGmailCache = inngest.createFunction(
  {
    id: "sync-gmail-cache",
    triggers: { event: corsairSyncEvents.gmail },
  },
  async ({ event, step }) => {
    const { tenantId } = event.data as SyncEventData

    if (!tenantId) {
      throw new Error("Missing tenantId for Gmail sync.")
    }

    return step.run("sync-gmail-cache", () => runPluginSync(tenantId, "gmail"))
  }
)

export const syncGoogleCalendarCache = inngest.createFunction(
  {
    id: "sync-google-calendar-cache",
    triggers: { event: corsairSyncEvents.googlecalendar },
  },
  async ({ event, step }) => {
    const { tenantId } = event.data as SyncEventData

    if (!tenantId) {
      throw new Error("Missing tenantId for Google Calendar sync.")
    }

    return step.run("sync-google-calendar-cache", () =>
      runPluginSync(tenantId, "googlecalendar")
    )
  }
)

export const refreshConnectedWorkspaceCaches = inngest.createFunction(
  {
    id: "refresh-connected-workspace-caches",
    triggers: { cron: "*/15 * * * *" },
  },
  async ({ step }) => {
    const targets = await step.run("list-connected-sync-targets", () =>
      listConnectedSyncTargets()
    )
    const results = []

    for (const target of targets) {
      const result = await step.run(
        `sync-${target.plugin}-${target.tenantId}`,
        () => runPluginSync(target.tenantId, target.plugin)
      )

      results.push(result)
    }

    return {
      syncedTargets: results.length,
      results,
    }
  }
)

export const functions = [
  syncGmailCache,
  syncGoogleCalendarCache,
  refreshConnectedWorkspaceCaches,
]
