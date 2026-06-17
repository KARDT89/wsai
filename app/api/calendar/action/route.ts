import { NextResponse } from "next/server"

import { triggerSync } from "@/inngest/client"
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

type CalendarEventData = {
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: { email: string; responseStatus?: string; self?: boolean; organizer?: boolean }[]
  recurrence?: string[]
  hangoutLink?: string
}

type CalendarApi = {
  events: {
    get: (args: { id: string }) => Promise<CalendarEventData>
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
    responseStatus?: string
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
      void triggerSync(session.user.id, "googlecalendar", "user_action")
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
      void triggerSync(session.user.id, "googlecalendar", "user_action")
      return NextResponse.json({ event })
    }

    if (action === "delete") {
      if (!payload.eventId) {
        return NextResponse.json({ error: "eventId is required for delete" }, { status: 400 })
      }
      await calendarApi.events.delete({ id: payload.eventId, sendUpdates: "all" })
      void triggerSync(session.user.id, "googlecalendar", "user_action")
      return NextResponse.json({ deleted: true })
    }

    if (action === "rsvp") {
      if (!payload.eventId || !payload.responseStatus) {
        return NextResponse.json(
          { error: "eventId and responseStatus are required for rsvp" },
          { status: 400 }
        )
      }
      const current = await calendarApi.events.get({ id: payload.eventId })
      const userEmail = session.user.email
      const updatedAttendees = (current.attendees ?? []).map((a) =>
        a.email === userEmail || a.self
          ? { ...a, responseStatus: payload.responseStatus }
          : a
      )
      await calendarApi.events.update({
        id: payload.eventId,
        event: {
          summary: current.summary,
          description: current.description,
          location: current.location,
          start: current.start,
          end: current.end,
          attendees: updatedAttendees,
          recurrence: current.recurrence,
        },
        sendUpdates: "none",
      })
      void triggerSync(session.user.id, "googlecalendar", "user_action")
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Calendar operation failed." },
      { status: 500 }
    )
  }
}

