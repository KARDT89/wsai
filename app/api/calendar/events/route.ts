import { enqueueCorsairSync } from "@/inngest/events"
import { getCachedCalendarEventsWithCache } from "@/lib/corsair-cache"
import { getCurrentSession } from "@/lib/session"
import type { CacheMetadata } from "@/lib/workspace-types"

const STALE_CACHE_MS = 5 * 60 * 1000

export async function GET() {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { events, cache } = await getCachedCalendarEventsWithCache(session.user.id)

  if (shouldRefreshCache(cache)) {
    void enqueueCorsairSync({
      tenantId: session.user.id,
      plugin: "googlecalendar",
      reason: "stale_cache",
    }).catch((error) => {
      console.error("[calendar] Failed to enqueue stale cache sync", error)
    })
  }

  return Response.json({ events, cache })
}

function shouldRefreshCache(cache: CacheMetadata) {
  if (cache.status === "running") return false
  if (cache.status === "failed") return true
  if (!cache.lastSyncedAt) return true

  const lastSyncedAt = new Date(cache.lastSyncedAt).getTime()
  return !Number.isFinite(lastSyncedAt) || Date.now() - lastSyncedAt > STALE_CACHE_MS
}
