"use client"

import type { ReactNode } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import {
  CalendarDaysIcon,
  Link04Icon,
  Location01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { CalendarEvent } from "@/lib/workspace-types"

export function CalendarDashboard() {
  const eventsQuery = useQuery({
    queryKey: ["calendar", "events"],
    queryFn: fetchCalendarEvents,
  })
  const events = eventsQuery.data ?? []
  const upcoming = events.slice(0, 8)
  const selected = upcoming[0]

  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-cols-1 bg-background lg:grid-cols-[280px_1fr]">
      <aside className="hidden border-r bg-muted/20 p-3 lg:block">
        <Button className="w-full justify-start gap-2">
          <HugeiconsIcon icon={CalendarDaysIcon} strokeWidth={2} className="size-4" />
          New Event
        </Button>

        <Separator className="my-4" />

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Calendars
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-sky-500" />
              Google Calendar
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full bg-emerald-500" />
              Workspace
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Upcoming
          </p>
          <div className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm leading-6 text-muted-foreground">
                No cached events yet.
              </p>
            ) : (
              upcoming.map((event) => (
                <div key={event.id} className="rounded-md border bg-background p-2">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.day} · {event.time}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      <main className="min-h-0">
        <div className="flex h-12 items-center justify-between border-b px-4">
          <div>
            <h1 className="text-sm font-semibold">Calendar</h1>
            <p className="text-xs text-muted-foreground">
              {events.length} cached events
            </p>
          </div>
          <Badge variant="outline" className="font-mono">
            googlecalendar cache
          </Badge>
        </div>

        {eventsQuery.isPending ? (
          <CalendarState
            title="Loading cached calendar"
            detail="Reading Google Calendar events from Corsair cache."
          />
        ) : eventsQuery.isError ? (
          <CalendarState
            title="Could not load calendar"
            detail="The calendar API returned an error while reading Corsair cache."
          />
        ) : events.length === 0 ? (
          <CalendarState
            title="No cached calendar events yet"
            detail="Connect Google Calendar and run Corsair backfill or wait for webhooks to populate corsair_entities."
          />
        ) : (
          <div className="grid h-[calc(100svh-6.5rem)] lg:grid-cols-[1fr_380px]">
            <ScrollArea className="border-r">
              <div className="grid min-h-full grid-cols-[72px_1fr]">
                <div className="border-r bg-muted/20">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-24 border-b px-2 py-2 text-right font-mono text-xs text-muted-foreground"
                    >
                      {String(index + 8).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                <div className="p-3">
                  <div className="grid gap-3">
                    {events.map((event) => (
                      <article
                        key={event.id}
                        className="rounded-lg border border-sky-500/25 bg-sky-500/10 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{event.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {event.day} · {event.time}
                            </p>
                          </div>
                          <Badge variant="secondary">{event.calendar}</Badge>
                        </div>
                        {event.description ? (
                          <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {event.description}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <aside className="hidden p-4 lg:block">
              {selected ? (
                <div className="rounded-lg border bg-card p-4">
                  <Badge variant="outline">{selected.day}</Badge>
                  <h2 className="mt-4 text-xl font-semibold tracking-normal">
                    {selected.title}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selected.time}
                  </p>

                  <div className="mt-5 space-y-3 text-sm">
                    {selected.location ? (
                      <Detail icon={Location01Icon}>{selected.location}</Detail>
                    ) : null}
                    {selected.meetingLink ? (
                      <Detail icon={Link04Icon}>{selected.meetingLink}</Detail>
                    ) : null}
                    <Detail icon={UserGroupIcon}>
                      {selected.attendees.length > 0
                        ? selected.attendees.join(", ")
                        : "No attendees cached"}
                    </Detail>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const response = await fetch("/api/calendar/events")

  if (!response.ok) {
    throw new Error("Unable to fetch calendar events")
  }

  const payload = (await response.json()) as { events?: CalendarEvent[] }
  return payload.events ?? []
}

function CalendarState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-[calc(100svh-6.5rem)] items-center justify-center p-6 text-center">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  )
}

function Detail({
  icon,
  children,
}: {
  icon: IconSvgElement
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <HugeiconsIcon
        icon={icon}
        strokeWidth={2}
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}
