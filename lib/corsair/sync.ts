import { addDays, subDays } from "date-fns"

import { getCorsairInstance, type CorsairPluginId } from "@/lib/corsair/server"
import { prisma } from "@/lib/db"
import {
  markSyncFailed,
  markSyncStarted,
  markSyncSucceeded,
} from "@/lib/sync-status"

type SyncResult = {
  plugin: CorsairPluginId
  synced: number
}

export const gmailMailboxes = [
  "inbox",
  "starred",
  "snoozed",
  "sent",
  "drafts",
  "trash",
] as const

export type GmailMailbox = (typeof gmailMailboxes)[number]

export const syncableCorsairPlugins = ["gmail", "googlecalendar"] as const

export type SyncableCorsairPluginId = (typeof syncableCorsairPlugins)[number]

export type CorsairSyncTarget = {
  tenantId: string
  plugin: SyncableCorsairPluginId
}

export async function syncCorsairPlugin(
  tenantId: string,
  plugin: CorsairPluginId,
  reason?: string | null
): Promise<SyncResult> {
  if (isSyncableCorsairPlugin(plugin)) {
    await markSyncStarted({ tenantId, plugin, reason })
  }

  try {
    const result = await syncCorsairPluginUnsafe(tenantId, plugin, reason)
    if (isSyncableCorsairPlugin(plugin)) {
      await markSyncSucceeded({
        tenantId,
        plugin,
        reason,
        itemCount: result.synced,
      })
    }
    return result
  } catch (error) {
    if (isSyncableCorsairPlugin(plugin)) {
      await markSyncFailed({ tenantId, plugin, reason, error })
    }
    throw error
  }
}

async function syncCorsairPluginUnsafe(
  tenantId: string,
  plugin: CorsairPluginId,
  reason?: string | null
): Promise<SyncResult> {
  if (plugin === "gmail") {
    return syncGmail(tenantId, reason)
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

export async function syncPrimaryCorsairPlugins(
  tenantId: string,
  reason: string | null = "scheduled"
) {
  return Promise.all([
    syncCorsairPlugin(tenantId, "gmail", reason).catch((error) => ({
      plugin: "gmail" as const,
      synced: 0,
      error: error instanceof Error ? error.message : "Unknown Gmail sync error",
    })),
    syncCorsairPlugin(tenantId, "googlecalendar", reason).catch((error) => ({
      plugin: "googlecalendar" as const,
      synced: 0,
      error:
        error instanceof Error ? error.message : "Unknown Google Calendar sync error",
    })),
  ])
}

async function syncGmail(
  tenantId: string,
  reason?: string | null
): Promise<SyncResult> {
  const results = await Promise.allSettled(
    gmailMailboxes.map((mailbox) => syncGmailMailbox(tenantId, mailbox, reason))
  )

  const synced = results.reduce((total, result) => {
    return total + (result.status === "fulfilled" ? result.value.synced : 0)
  }, 0)

  return {
    plugin: "gmail",
    synced,
  }
}

export async function syncGmailMailbox(
  tenantId: string,
  mailbox: GmailMailbox,
  reason?: string | null
) {
  await markSyncStarted({ tenantId, plugin: "gmail", scope: mailbox, reason })

  try {
    const result = await syncGmailMailboxUnsafe(tenantId, mailbox)
    await markSyncSucceeded({
      tenantId,
      plugin: "gmail",
      scope: mailbox,
      reason,
      itemCount: result.synced,
    })
    return result
  } catch (error) {
    await markSyncFailed({
      tenantId,
      plugin: "gmail",
      scope: mailbox,
      reason,
      error,
    })
    throw error
  }
}

async function syncGmailMailboxUnsafe(tenantId: string, mailbox: GmailMailbox) {
  const corsair = getCorsairInstance().withTenant(tenantId)
  const gmailApi = corsair.gmail.api

  if (mailbox === "drafts") {
    const response = await gmailApi.drafts.list({ maxResults: 25 })
    const drafts = response.drafts ?? []

    const draftDetails = await Promise.all(
      drafts.slice(0, 25).map((draft) =>
        draft.id
          ? gmailApi.drafts.get({
              id: draft.id,
              format: "full",
            })
          : null
      )
    )
    const messageIds = new Set<string>()

    for (const draft of draftDetails) {
      if (draft?.message?.id) {
        messageIds.add(draft.message.id)
      }
    }

    await Promise.all(
      [...messageIds].map((id) =>
        gmailApi.messages.get({
          id,
          format: "full",
        })
      )
    )

    await gmailApi.labels.list({})

    return {
      mailbox,
      synced: drafts.length,
    }
  }

  const labelIds = getMailboxLabelIds(mailbox)
  const response = await gmailApi.threads.list({
    maxResults: 25,
    labelIds,
    includeSpamTrash: mailbox === "trash",
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
    mailbox,
    synced: threads.length,
  }
}

function getMailboxLabelIds(mailbox: GmailMailbox) {
  if (mailbox === "inbox") return ["INBOX"]
  if (mailbox === "starred") return ["STARRED"]
  if (mailbox === "snoozed") return ["SNOOZED"]
  if (mailbox === "sent") return ["SENT"]
  if (mailbox === "trash") return ["TRASH"]
  return undefined
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
