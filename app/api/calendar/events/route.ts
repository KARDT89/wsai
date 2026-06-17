import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"
import { getSyncStatus, type SyncStatusMetadata } from "@/lib/sync-status"
import type { CacheMetadata, CalendarAttendee, CalendarEvent } from "@/lib/workspace-types"

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const [rows, syncStatus] = await Promise.all([
    prisma.corsairEntity.findMany({
      where: {
        account: {
          tenantId: session.user.id,
          integration: { name: "googlecalendar" },
        },
        entityType: { in: ["events", "event"] },
      },
      select: { entityId: true, data: true },
      orderBy: { updatedAt: "asc" },
      take: 500,
    }),
    getSyncStatus(session.user.id, "googlecalendar"),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asAny = (x: unknown) => x as any
  const minTime = Date.now() - ONE_WEEK_MS

  const events: CalendarEvent[] = rows
    .map((r) => {
      const d = asAny(r.data)
      const start = d?.start?.dateTime ?? d?.start?.date
      if (!start) return null
      if (new Date(start).getTime() < minTime) return null
      return mapCalendarEvent(r.entityId, d)
    })
    .filter((e): e is CalendarEvent => e !== null)
    .sort((a, b) => {
      return (a.startsAt ? new Date(a.startsAt).getTime() : 0) -
             (b.startsAt ? new Date(b.startsAt).getTime() : 0)
    })

  return Response.json(
    { events, cache: toCacheMetadata(syncStatus, events.length) },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCalendarEvent(entityId: string, d: any): CalendarEvent {
  const startsAt: string | undefined = d?.start?.dateTime ?? d?.start?.date
  const endsAt: string | undefined = d?.end?.dateTime ?? d?.end?.date

  const day = startsAt
    ? new Date(startsAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
    : ""
  const time = startsAt
    ? new Date(startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : ""

  type RawAttendee = {
    email?: string
    displayName?: string
    responseStatus?: string
    self?: boolean
    organizer?: boolean
  }

  const rawAttendees: RawAttendee[] = Array.isArray(d?.attendees) ? d.attendees : []

  const attendeeDetails = rawAttendees.map((a) => ({
    email: a.email ?? "",
    displayName: a.displayName,
    responseStatus: a.responseStatus as CalendarAttendee["responseStatus"],
    self: a.self,
    organizer: a.organizer,
  })).filter((a) => a.email)

  const attendees = attendeeDetails.map((a) => a.email)
  const me = attendeeDetails.find((a) => a.self)
  const organizer = attendeeDetails.find((a) => a.organizer)

  return {
    id: entityId,
    corsairId: entityId,
    title: d?.summary ?? "(no title)",
    startsAt,
    endsAt,
    day,
    time,
    location: d?.location,
    meetingLink: d?.hangoutLink,
    attendees,
    attendeeDetails,
    myResponseStatus: me?.responseStatus,
    iAmOrganizer: organizer?.self ?? false,
    description: d?.description,
    calendar: d?.calendarId ?? "primary",
  }
}

function toCacheMetadata(status: SyncStatusMetadata | null, itemCount: number): CacheMetadata {
  return {
    lastSyncedAt: status?.lastSyncedAt ?? null,
    lastStartedAt: status?.lastStartedAt ?? null,
    lastFailedAt: status?.lastFailedAt ?? null,
    lastError: status?.lastError ?? null,
    status: status?.status ?? "idle",
    reason: status?.reason ?? null,
    itemCount: status?.itemCount ?? itemCount,
  }
}
