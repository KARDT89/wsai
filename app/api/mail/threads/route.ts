import { enqueueCorsairSync } from "@/inngest/events"
import { getCachedMailThreadsWithCache } from "@/lib/corsair-cache"
import { gmailMailboxes, type GmailMailbox } from "@/lib/corsair/sync"
import { getCurrentSession } from "@/lib/session"
import type { CacheMetadata } from "@/lib/workspace-types"

const STALE_CACHE_MS = 5 * 60 * 1000

export async function GET(request: Request) {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const mailbox = getMailboxFromRequest(request)
  const { threads, cache } = await getCachedMailThreadsWithCache(session.user.id, mailbox)

  if (shouldRefreshCache(cache)) {
    void enqueueCorsairSync({
      tenantId: session.user.id,
      plugin: "gmail",
      mailbox,
      reason: "stale_cache",
    }).catch((error) => {
      console.error("[mail] Failed to enqueue stale cache sync", error)
    })
  }

  return Response.json({ threads, cache })
}

function getMailboxFromRequest(request: Request): GmailMailbox {
  const value = new URL(request.url).searchParams.get("mailbox")

  if (gmailMailboxes.includes(value as GmailMailbox)) {
    return value as GmailMailbox
  }

  return "inbox"
}

function shouldRefreshCache(cache: CacheMetadata) {
  if (cache.status === "running") return false
  if (cache.status === "failed") return true
  if (!cache.lastSyncedAt) return true

  const lastSyncedAt = new Date(cache.lastSyncedAt).getTime()
  return !Number.isFinite(lastSyncedAt) || Date.now() - lastSyncedAt > STALE_CACHE_MS
}
