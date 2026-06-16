import { addDays, subDays } from "date-fns"

import { getCorsairInstance, type CorsairPluginId } from "@/lib/corsair/server"
import { prisma } from "@/lib/db"

type SyncResult = {
  plugin: CorsairPluginId
  synced: number
}

export const syncableCorsairPlugins = ["gmail", "googlecalendar"] as const

export type SyncableCorsairPluginId = (typeof syncableCorsairPlugins)[number]

export type CorsairSyncTarget = {
  tenantId: string
  plugin: SyncableCorsairPluginId
}

export async function syncCorsairPlugin(
  tenantId: string,
  plugin: CorsairPluginId
): Promise<SyncResult> {
  if (plugin === "gmail") {
    return syncGmail(tenantId)
  }

  if (plugin === "googlecalendar") {
    return syncGoogleCalendar(tenantId)
  }

  return { plugin, synced: 0 }
}

export function isSyncableCorsairPlugin(
  plugin: string
): plugin is SyncableCorsairPluginId {
  return syncableCorsairPlugins.includes(plugin as SyncableCorsairPluginId)
}

export async function listConnectedSyncTargets(): Promise<CorsairSyncTarget[]> {
  const accounts = await prisma.corsairAccount.findMany({
    where: {
      dek: {
        not: null,
      },
      integration: {
        name: {
          in: [...syncableCorsairPlugins],
        },
      },
    },
    select: {
      tenantId: true,
      integration: {
        select: {
          name: true,
        },
      },
    },
  })

  const uniqueTargets = new Map<string, CorsairSyncTarget>()

  for (const account of accounts) {
    if (!isSyncableCorsairPlugin(account.integration.name)) {
      continue
    }

    const key = `${account.tenantId}:${account.integration.name}`
    uniqueTargets.set(key, {
      tenantId: account.tenantId,
      plugin: account.integration.name,
    })
  }

  return Array.from(uniqueTargets.values())
}

export async function syncPrimaryCorsairPlugins(tenantId: string) {
  return Promise.all([
    syncCorsairPlugin(tenantId, "gmail").catch((error) => ({
      plugin: "gmail" as const,
      synced: 0,
      error: error instanceof Error ? error.message : "Unknown Gmail sync error",
    })),
    syncCorsairPlugin(tenantId, "googlecalendar").catch((error) => ({
      plugin: "googlecalendar" as const,
      synced: 0,
      error:
        error instanceof Error ? error.message : "Unknown Google Calendar sync error",
    })),
  ])
}

async function syncGmail(tenantId: string): Promise<SyncResult> {
  const corsair = getCorsairInstance().withTenant(tenantId)
  const gmailApi = corsair.gmail.api
  const response = await gmailApi.threads.list({
    maxResults: 25,
    labelIds: ["INBOX"],
  })
  const threads = response.threads ?? []

  const threadDetails = await Promise.all(
    threads.slice(0, 25).map((thread) =>
      thread.id
        ? gmailApi.threads.get({
            id: thread.id,
            format: "full",
          })
        : null
    )
  )
  const messageIds = new Set<string>()

  for (const thread of threadDetails) {
    for (const message of thread?.messages ?? []) {
      if (message.id) {
        messageIds.add(message.id)
      }
    }
  }

  await Promise.all(
    [...messageIds].slice(0, 75).map((id) =>
      gmailApi.messages.get({
        id,
        format: "full",
      })
    )
  )

  await gmailApi.labels.list({})

  return {
    plugin: "gmail",
    synced: threads.length,
  }
}

async function syncGoogleCalendar(tenantId: string): Promise<SyncResult> {
  const corsair = getCorsairInstance().withTenant(tenantId)
  const calendarApi = corsair.googlecalendar.api
  const response = await calendarApi.events.getMany({
    calendarId: "primary",
    timeMin: subDays(new Date(), 7).toISOString(),
    timeMax: addDays(new Date(), 45).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 80,
  })

  return {
    plugin: "googlecalendar",
    synced: response.items?.length ?? 0,
  }
}
