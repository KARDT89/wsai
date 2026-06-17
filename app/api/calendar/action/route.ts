import { NextResponse } from "next/server"

import { enqueueCorsairSync } from "@/inngest/events"
import { ensureCorsairSetup, getCorsairInstance } from "@/lib/corsair/server"
import { getCurrentSession } from "@/lib/session"

type CalendarEventInput = {
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: { email: string }[]
  recurrence?: string[]
}

type CalendarApi = {
  events: {
    create: (args: { event: CalendarEventInput; sendUpdates?: string }) => Promise<unknown>
    update: (args: {
      id: string
      event: CalendarEventInput
      sendUpdates?: string
    }) => Promise<unknown>
    delete: (args: { id: string; sendUpdates?: string }) => Promise<unknown>
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = (await request.json()) as {
    action?: string
    eventId?: string
    event?: CalendarEventInput
  }

  const { action } = payload

  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 })
  }

  try {
    await ensureCorsairSetup(session.user.id)
    const calendarApi = getCorsairInstance().withTenant(session.user.id).googlecalendar
      .api as unknown as CalendarApi

    if (action === "create") {
      if (!payload.event) {
        return NextResponse.json({ error: "event is required for create" }, { status: 400 })
      }
      const event = await calendarApi.events.create({
        event: payload.event,
        sendUpdates: "all",
      })
      await enqueueCalendarSync(session.user.id)
      return NextResponse.json({ event })
    }

    if (action === "update") {
      if (!payload.eventId || !payload.event) {
        return NextResponse.json(
          { error: "eventId and event are required for update" },
          { status: 400 }
        )
      }
      const event = await calendarApi.events.update({
        id: payload.eventId,
        event: payload.event,
        sendUpdates: "all",
      })
      await enqueueCalendarSync(session.user.id)
      return NextResponse.json({ event })
    }

    if (action === "delete") {
      if (!payload.eventId) {
        return NextResponse.json({ error: "eventId is required for delete" }, { status: 400 })
      }
      await calendarApi.events.delete({ id: payload.eventId, sendUpdates: "all" })
      await enqueueCalendarSync(session.user.id)
      return NextResponse.json({ deleted: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Calendar operation failed." },
      { status: 500 }
    )
  }
}

function enqueueCalendarSync(tenantId: string) {
  return enqueueCorsairSync({
    tenantId,
    plugin: "googlecalendar",
    reason: "user_action",
  })
}
