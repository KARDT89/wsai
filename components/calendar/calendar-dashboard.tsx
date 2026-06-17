"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Delete02Icon,
  Edit02Icon,
  Location01Icon,
  RefreshIcon,
  UserGroupIcon,
  Link04Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { CacheMetadata, CalendarEvent } from "@/lib/workspace-types"

// ─── Constants ──────────────────────────────────────────────────────────────

const START_HOUR = 7
const END_HOUR = 22
const HOUR_HEIGHT = 64 // px per hour
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

type ViewMode = "week" | "month" | "day"

type CalendarEventsResponse = {
  events: CalendarEvent[]
  cache?: CacheMetadata
}

// ─── Event helpers ───────────────────────────────────────────────────────────

function eventTop(event: CalendarEvent): number {
  if (!event.startsAt) return 0
  const d = new Date(event.startsAt)
  const hours = getHours(d) + getMinutes(d) / 60
  return Math.max(0, (hours - START_HOUR) * HOUR_HEIGHT)
}

function eventHeight(event: CalendarEvent): number {
  if (!event.startsAt || !event.endsAt) return HOUR_HEIGHT
  const start = new Date(event.startsAt).getTime()
  const end = new Date(event.endsAt).getTime()
  const durationHours = Math.max(0.25, (end - start) / (1000 * 60 * 60))
  return durationHours * HOUR_HEIGHT
}

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => e.startsAt && isSameDay(new Date(e.startsAt), day))
}

function isAllDay(event: CalendarEvent): boolean {
  if (!event.startsAt) return true
  const d = new Date(event.startsAt)
  return isNaN(d.getTime()) || (getHours(d) === 0 && getMinutes(d) === 0 && !event.endsAt)
}

function toLocalDatetimeInput(iso?: string): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ""
  }
}

function localDatetimeToISO(value: string): string {
  if (!value) return ""
  return new Date(value).toISOString()
}

function formatCacheStatus(cache?: CacheMetadata) {
  if (cache?.status === "running") return "Refreshing..."
  if (cache?.status === "failed") return "Sync issue"
  return formatCacheFreshness(cache?.lastSyncedAt)
}

function formatCacheFreshness(value?: string | null) {
  if (!value) return "Not synced"

  const syncedAt = new Date(value).getTime()
  if (!Number.isFinite(syncedAt)) return "Cached"

  const seconds = Math.max(0, Math.floor((Date.now() - syncedAt) / 1000))
  if (seconds < 15) return "Synced just now"
  if (seconds < 60) return `Synced ${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Synced ${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Synced ${hours}h ago`

  const days = Math.floor(hours / 24)
  return `Synced ${days}d ago`
}

// ─── API calls ───────────────────────────────────────────────────────────────

async function fetchCalendarEvents(): Promise<CalendarEventsResponse> {
  const r = await fetch("/api/calendar/events", { cache: "no-store" })
  if (!r.ok) throw new Error("Failed to load events")
  const data = (await r.json()) as CalendarEventsResponse
  return {
    events: data.events ?? [],
    cache: data.cache,
  }
}

async function calendarAction(payload: Record<string, unknown>): Promise<void> {
  const r = await fetch("/api/calendar/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? "Action failed")
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CalendarDashboard() {
  const qc = useQueryClient()
  const [view, setView] = React.useState<ViewMode>("week")
  const [currentDate, setCurrentDate] = React.useState(new Date())
  const [selectedEvent, setSelectedEvent] = React.useState<CalendarEvent | null>(null)
  const [dialogState, setDialogState] = React.useState<{
    open: boolean
    mode: "create" | "edit"
    event?: CalendarEvent
    prefillStart?: string
  }>({ open: false, mode: "create" })

  const eventsQuery = useQuery({
    queryKey: ["calendar", "events"],
    queryFn: fetchCalendarEvents,
    staleTime: 30_000,
  })

  React.useEffect(() => {
    const es = new EventSource("/api/realtime/stream")
    es.addEventListener("sync-complete", (e) => {
      const data = JSON.parse(e.data) as { plugin: string; status: string }
      if (data.plugin === "googlecalendar" && data.status === "success") {
        void qc.invalidateQueries({ queryKey: ["calendar", "events"] })
      }
    })
    return () => es.close()
  }, [qc])
  const events = eventsQuery.data?.events ?? []

  const cacheLabel = formatCacheStatus(eventsQuery.data?.cache)

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => calendarAction({ action: "delete", eventId }),
    onSuccess: () => {
      void qc.refetchQueries({ queryKey: ["calendar", "events"] })
      setSelectedEvent(null)
      toast.success("Event deleted")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Keyboard shortcuts
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return
      if (e.key === "Escape") { setSelectedEvent(null); setDialogState({ open: false, mode: "create" }) }
      if (e.key === "n") { e.preventDefault(); openCreateDialog() }
      if (e.key === "t") { e.preventDefault(); setCurrentDate(new Date()) }
      if (e.key === "w") { e.preventDefault(); setView("week") }
      if (e.key === "m") { e.preventDefault(); setView("month") }
      if (e.key === "d") { e.preventDefault(); setView("day") }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !dialogState.open) {
        e.preventDefault()
        navigate(e.key === "ArrowLeft" ? -1 : 1)
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEvent && !dialogState.open) {
        e.preventDefault()
        deleteMutation.mutate(selectedEvent.corsairId)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent, dialogState.open, view])

  function navigate(dir: -1 | 1) {
    if (view === "week") setCurrentDate((d) => (dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1)))
    if (view === "month") setCurrentDate((d) => (dir === 1 ? addMonths(d, 1) : subMonths(d, 1)))
    if (view === "day") setCurrentDate((d) => addDays(d, dir))
  }

  function openCreateDialog(prefillStart?: string) {
    setDialogState({ open: true, mode: "create", prefillStart })
  }

  function openEditDialog(event: CalendarEvent) {
    setDialogState({ open: true, mode: "edit", event })
  }

  const weekDays = React.useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: addDays(start, 6) })
  }, [currentDate])

  const monthDays = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  function headerLabel() {
    if (view === "week") {
      const start = weekDays[0]!
      const end = weekDays[6]!
      if (isSameMonth(start, end)) return format(start, "MMMM yyyy")
      return `${format(start, "MMM")} – ${format(end, "MMM yyyy")}`
    }
    if (view === "day") return format(currentDate, "EEEE, MMMM d, yyyy")
    return format(currentDate, "MMMM yyyy")
  }

  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-cols-1 bg-background lg:grid-cols-[260px_1fr]">
      {/* ── Sidebar ── */}
      <aside className="hidden flex-col gap-4 border-r bg-muted/20 p-3 lg:flex">
        <Button
          className="w-full justify-start gap-2"
          onClick={() => openCreateDialog()}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
          New Event
        </Button>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cache
          </p>
          <Badge variant="outline" className="font-mono text-[10px]">
            {cacheLabel}
          </Badge>
        </div>

        <Separator />

        {/* Mini month calendar */}
        <MiniCalendar
          currentDate={currentDate}
          onSelectDay={(day) => { setCurrentDate(day); setView("day") }}
        />

        <Separator />

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Calendars
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-sky-500" />
              Google Calendar
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Shortcuts
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>New event</span>
              <kbd className="rounded border px-1 font-mono">n</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span>Today</span>
              <kbd className="rounded border px-1 font-mono">t</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span>Navigate</span>
              <div className="flex gap-1">
                <kbd className="rounded border px-1 font-mono">←</kbd>
                <kbd className="rounded border px-1 font-mono">→</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span>Week / Month / Day</span>
              <div className="flex gap-1">
                <kbd className="rounded border px-1 font-mono">w</kbd>
                <kbd className="rounded border px-1 font-mono">m</kbd>
                <kbd className="rounded border px-1 font-mono">d</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span>Delete selected</span>
              <kbd className="rounded border px-1 font-mono">Del</kbd>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex min-h-0 flex-col">
        {/* Header bar */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate(-1)}>
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate(1)}>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
            </Button>
            <span className="text-sm font-semibold">{headerLabel()}</span>
          </div>

          <div className="flex items-center gap-1">
            {(["day", "week", "month"] as ViewMode[]).map((v) => (
              <Button
                key={v}
                variant={view === v ? "secondary" : "ghost"}
                size="sm"
                className="capitalize"
                onClick={() => setView(v)}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>

        {/* Calendar view */}
        {eventsQuery.isPending ? (
          <CalendarState title="Loading…" detail="Fetching current calendar events." />
        ) : eventsQuery.isError ? (
          <CalendarState title="Error" detail="Could not load calendar events." />
        ) : view === "week" ? (
          <WeekView
            days={weekDays}
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            onClickSlot={(day, hour) => {
              const d = new Date(day)
              d.setHours(hour, 0, 0, 0)
              openCreateDialog(d.toISOString())
            }}
          />
        ) : view === "day" ? (
          <DayView
            day={currentDate}
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            onClickSlot={(day, hour) => {
              const d = new Date(day)
              d.setHours(hour, 0, 0, 0)
              openCreateDialog(d.toISOString())
            }}
          />
        ) : (
          <MonthView
            days={monthDays}
            currentDate={currentDate}
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            onClickDay={(day) => { setCurrentDate(day); setView("day") }}
          />
        )}
      </main>

      {/* ── Event detail panel ── */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => openEditDialog(selectedEvent)}
          onDelete={() => deleteMutation.mutate(selectedEvent.corsairId)}
          isDeleting={deleteMutation.isPending}
        />
      )}

      {/* ── Create / Edit dialog ── */}
      <EventDialog
        key={
          dialogState.open
            ? `${dialogState.mode}-${dialogState.event?.id ?? "new"}-${dialogState.prefillStart ?? ""}`
            : "closed"
        }
        open={dialogState.open}
        mode={dialogState.mode}
        event={dialogState.event}
        prefillStart={dialogState.prefillStart}
        onClose={() => setDialogState({ open: false, mode: "create" })}
        onSaved={() => {
          void qc.refetchQueries({ queryKey: ["calendar", "events"] })
          setDialogState({ open: false, mode: "create" })
        }}
      />
    </div>
  )
}

// ─── Week view ───────────────────────────────────────────────────────────────

function WeekView({
  days,
  events,
  selectedEvent,
  onSelectEvent,
  onClickSlot,
}: {
  days: Date[]
  events: CalendarEvent[]
  selectedEvent: CalendarEvent | null
  onSelectEvent: (e: CalendarEvent) => void
  onClickSlot: (day: Date, hour: number) => void
}) {
  return (
    <div className="flex min-h-0 flex-col flex-1">
      {/* Day header row */}
      <div className="grid shrink-0 border-b" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
        <div className="border-r" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "flex flex-col items-center py-2 text-xs border-r last:border-r-0",
              isToday(day) && "text-sky-500"
            )}
          >
            <span className="text-muted-foreground uppercase">{format(day, "EEE")}</span>
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full font-semibold text-sm",
                isToday(day) && "bg-sky-500 text-white"
              )}
            >
              {format(day, "d")}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable time grid */}
      <ScrollArea className="flex-1">
        <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          {/* Time gutter */}
          <div className="border-r">
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex items-start justify-end pr-2 text-[10px] text-muted-foreground"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="-mt-2">{h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              events={eventsForDay(events, day)}
              selectedEvent={selectedEvent}
              onSelectEvent={onSelectEvent}
              onClickSlot={onClickSlot}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── Day view ────────────────────────────────────────────────────────────────

function DayView({
  day,
  events,
  selectedEvent,
  onSelectEvent,
  onClickSlot,
}: {
  day: Date
  events: CalendarEvent[]
  selectedEvent: CalendarEvent | null
  onSelectEvent: (e: CalendarEvent) => void
  onClickSlot: (day: Date, hour: number) => void
}) {
  return (
    <div className="flex min-h-0 flex-col flex-1">
      <div className="grid shrink-0 border-b" style={{ gridTemplateColumns: "56px 1fr" }}>
        <div className="border-r" />
        <div className={cn("flex flex-col items-center py-2 text-xs", isToday(day) && "text-sky-500")}>
          <span className="text-muted-foreground uppercase">{format(day, "EEEE")}</span>
          <span
            className={cn(
              "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full font-semibold text-sm",
              isToday(day) && "bg-sky-500 text-white"
            )}
          >
            {format(day, "d")}
          </span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="grid" style={{ gridTemplateColumns: "56px 1fr" }}>
          <div className="border-r">
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex items-start justify-end pr-2 text-[10px] text-muted-foreground"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="-mt-2">{h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`}</span>
              </div>
            ))}
          </div>
          <DayColumn
            day={day}
            events={eventsForDay(events, day)}
            selectedEvent={selectedEvent}
            onSelectEvent={onSelectEvent}
            onClickSlot={onClickSlot}
          />
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── Day column (shared by week/day) ─────────────────────────────────────────

function DayColumn({
  day,
  events,
  selectedEvent,
  onSelectEvent,
  onClickSlot,
}: {
  day: Date
  events: CalendarEvent[]
  selectedEvent: CalendarEvent | null
  onSelectEvent: (e: CalendarEvent) => void
  onClickSlot: (day: Date, hour: number) => void
}) {
  const timedEvents = events.filter((e) => !isAllDay(e))
  const columns = layoutColumns(timedEvents)

  return (
    <div
      className="relative border-r last:border-r-0"
      style={{ height: TOTAL_HEIGHT }}
    >
      {/* Hour grid lines + click targets */}
      {HOURS.map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
          style={{ top: (h - START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
          onClick={() => onClickSlot(day, h)}
        />
      ))}

      {/* Events */}
      {columns.map(({ event, col, totalCols }) => {
        const top = eventTop(event)
        const height = Math.max(22, eventHeight(event))
        const width = `calc(${100 / totalCols}% - 4px)`
        const left = `calc(${(col / totalCols) * 100}% + 2px)`
        const isSelected = selectedEvent?.id === event.id

        return (
          <button
            key={event.id}
            className={cn(
              "absolute rounded-md px-1.5 py-0.5 text-left text-xs font-medium transition-all overflow-hidden",
              "bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30",
              "hover:bg-sky-500/30 hover:border-sky-500/60",
              isSelected && "ring-2 ring-sky-500 bg-sky-500/30"
            )}
            style={{ top, height, width, left }}
            onClick={(e) => { e.stopPropagation(); onSelectEvent(event) }}
          >
            <p className="truncate leading-tight">{event.title}</p>
            {height > 40 && (
              <p className="truncate text-[10px] opacity-75 mt-0.5">{event.time}</p>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Simple column layout to avoid overlapping events
function layoutColumns(events: CalendarEvent[]) {
  const result: { event: CalendarEvent; col: number; totalCols: number }[] = []
  const groups: CalendarEvent[][] = []

  for (const event of events) {
    const start = event.startsAt ? new Date(event.startsAt).getTime() : 0
    const end = event.endsAt ? new Date(event.endsAt).getTime() : start + 3600000
    let placed = false

    for (const group of groups) {
      const overlaps = group.some((g) => {
        const gs = g.startsAt ? new Date(g.startsAt).getTime() : 0
        const ge = g.endsAt ? new Date(g.endsAt).getTime() : gs + 3600000
        return start < ge && end > gs
      })
      if (overlaps) {
        group.push(event)
        placed = true
        break
      }
    }

    if (!placed) groups.push([event])
  }

  for (const group of groups) {
    for (let i = 0; i < group.length; i++) {
      result.push({ event: group[i]!, col: i, totalCols: group.length })
    }
  }

  return result
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({
  days,
  currentDate,
  events,
  selectedEvent,
  onSelectEvent,
  onClickDay,
}: {
  days: Date[]
  currentDate: Date
  events: CalendarEvent[]
  selectedEvent: CalendarEvent | null
  onSelectEvent: (e: CalendarEvent) => void
  onClickDay: (day: Date) => void
}) {
  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b shrink-0">
        {DAY_NAMES.map((name) => (
          <div key={name} className="py-2 text-center text-xs font-medium text-muted-foreground border-r last:border-r-0">
            {name}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: "1fr" }}>
        {days.map((day) => {
          const dayEvents = eventsForDay(events, day)
          const inMonth = isSameMonth(day, currentDate)

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "border-b border-r last:border-r-0 p-1 min-h-25 cursor-pointer hover:bg-muted/30 transition-colors",
                !inMonth && "opacity-40"
              )}
              onClick={() => onClickDay(day)}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1",
                  isToday(day) && "bg-sky-500 text-white"
                )}
              >
                {format(day, "d")}
              </span>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    className={cn(
                      "w-full truncate rounded px-1 py-0.5 text-left text-[11px] font-medium leading-tight",
                      "bg-sky-500/20 text-sky-700 dark:text-sky-300 hover:bg-sky-500/40 transition-colors",
                      selectedEvent?.id === event.id && "ring-1 ring-sky-500"
                    )}
                    onClick={(e) => { e.stopPropagation(); onSelectEvent(event) }}
                  >
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Mini calendar ────────────────────────────────────────────────────────────

function MiniCalendar({
  currentDate,
  onSelectDay,
}: {
  currentDate: Date
  onSelectDay: (day: Date) => void
}) {
  const [miniDate, setMiniDate] = React.useState(currentDate)
  const start = startOfWeek(startOfMonth(miniDate), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(miniDate), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start, end })

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMiniDate((d) => subMonths(d, 1))} className="p-0.5 hover:text-foreground text-muted-foreground">
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3" />
        </button>
        <span className="font-medium text-xs">{format(miniDate, "MMMM yyyy")}</span>
        <button onClick={() => setMiniDate((d) => addMonths(d, 1))} className="p-0.5 hover:text-foreground text-muted-foreground">
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-muted-foreground font-medium">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center gap-y-0.5">
        {days.map((day) => (
          <button
            key={day.toISOString()}
            className={cn(
              "h-6 w-6 mx-auto rounded-full flex items-center justify-center hover:bg-muted transition-colors",
              !isSameMonth(day, miniDate) && "opacity-30",
              isToday(day) && "bg-sky-500 text-white hover:bg-sky-600",
              isSameDay(day, currentDate) && !isToday(day) && "bg-muted font-semibold"
            )}
            onClick={() => onSelectDay(day)}
          >
            {format(day, "d")}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Event detail panel ───────────────────────────────────────────────────────

function EventDetailPanel({
  event,
  onClose,
  onEdit,
  onDelete,
  isDeleting,
}: {
  event: CalendarEvent
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  isDeleting: boolean
}) {
  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l bg-background shadow-xl lg:inset-y">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">Event Details</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold leading-snug">{event.title}</h2>
            <Badge variant="outline" className="mt-1 text-xs">{event.calendar}</Badge>
          </div>

          <Separator />

          <DetailRow icon={Calendar03Icon}>
            <span>{event.day}</span>
          </DetailRow>

          <DetailRow icon={Clock01Icon}>
            <span>{event.time}</span>
          </DetailRow>

          {event.location && (
            <DetailRow icon={Location01Icon}>
              <span>{event.location}</span>
            </DetailRow>
          )}

          {event.meetingLink && (
            <DetailRow icon={Link04Icon}>
              <a
                href={event.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-500 underline-offset-4 hover:underline break-all"
              >
                Join meeting
              </a>
            </DetailRow>
          )}

          <DetailRow icon={UserGroupIcon}>
            <span>
              {event.attendees.length > 0 ? event.attendees.join(", ") : "No attendees"}
            </span>
          </DetailRow>

          {event.description && (
            <>
              <Separator />
              <p className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap">
                {event.description}
              </p>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function DetailRow({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"]
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <HugeiconsIcon icon={icon} strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 wrap-break-words">{children}</span>
    </div>
  )
}

// ─── Create / Edit dialog ─────────────────────────────────────────────────────

type EventForm = {
  title: string
  startDatetime: string
  endDatetime: string
  location: string
  description: string
  attendees: string
  allDay: boolean
}

function initialEventForm({
  mode,
  event,
  defaultStart,
  defaultEnd,
}: {
  mode: "create" | "edit"
  event?: CalendarEvent
  defaultStart: string
  defaultEnd: string
}): EventForm {
  if (mode === "edit" && event) {
    return {
      title: event.title,
      startDatetime: toLocalDatetimeInput(event.startsAt),
      endDatetime: toLocalDatetimeInput(event.endsAt),
      location: event.location ?? "",
      description: event.description ?? "",
      attendees: event.attendees.join(", "),
      allDay: false,
    }
  }

  return {
    title: "",
    startDatetime: defaultStart,
    endDatetime: defaultEnd,
    location: "",
    description: "",
    attendees: "",
    allDay: false,
  }
}

function EventDialog({
  open,
  mode,
  event,
  prefillStart,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: "create" | "edit"
  event?: CalendarEvent
  prefillStart?: string
  onClose: () => void
  onSaved: () => void
}) {
  const defaultStart = React.useMemo(() => {
    if (prefillStart) return toLocalDatetimeInput(prefillStart)
    const d = new Date()
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 1)
    return toLocalDatetimeInput(d.toISOString())
  }, [prefillStart])

  const defaultEnd = React.useMemo(() => {
    if (prefillStart) {
      const d = new Date(prefillStart)
      d.setHours(d.getHours() + 1)
      return toLocalDatetimeInput(d.toISOString())
    }
    const d = new Date()
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 2)
    return toLocalDatetimeInput(d.toISOString())
  }, [prefillStart])

  const [form, setForm] = React.useState<EventForm>(() =>
    initialEventForm({ mode, event, defaultStart, defaultEnd })
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      const attendees = form.attendees
        .split(/[,;\s]+/)
        .map((a) => a.trim())
        .filter((a) => a.includes("@"))
        .map((email) => ({ email }))

      const eventPayload = {
        summary: form.title,
        location: form.location || undefined,
        description: form.description || undefined,
        attendees: attendees.length > 0 ? attendees : undefined,
        start: form.allDay
          ? { date: form.startDatetime.slice(0, 10) }
          : { dateTime: localDatetimeToISO(form.startDatetime), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        end: form.allDay
          ? { date: form.endDatetime.slice(0, 10) }
          : { dateTime: localDatetimeToISO(form.endDatetime), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      }

      if (mode === "edit" && event) {
        await calendarAction({ action: "update", eventId: event.corsairId, event: eventPayload })
      } else {
        await calendarAction({ action: "create", event: eventPayload })
      }
    },
    onSuccess: () => {
      toast.success(mode === "edit" ? "Event updated" : "Event created")
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function field(key: keyof EventForm, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="evt-title">Title</Label>
            <Input
              id="evt-title"
              placeholder="Event title"
              value={form.title}
              onChange={(e) => field("title", e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="evt-allday"
              checked={form.allDay}
              onChange={(e) => field("allDay", e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="evt-allday" className="cursor-pointer">All day</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="evt-start">{form.allDay ? "Start date" : "Start"}</Label>
              <Input
                id="evt-start"
                type={form.allDay ? "date" : "datetime-local"}
                value={form.allDay ? form.startDatetime.slice(0, 10) : form.startDatetime}
                onChange={(e) => field("startDatetime", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-end">{form.allDay ? "End date" : "End"}</Label>
              <Input
                id="evt-end"
                type={form.allDay ? "date" : "datetime-local"}
                value={form.allDay ? form.endDatetime.slice(0, 10) : form.endDatetime}
                onChange={(e) => field("endDatetime", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="evt-location">Location</Label>
            <Input
              id="evt-location"
              placeholder="Add location"
              value={form.location}
              onChange={(e) => field("location", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="evt-attendees">Guests</Label>
            <Input
              id="evt-attendees"
              placeholder="email@example.com, ..."
              value={form.attendees}
              onChange={(e) => field("attendees", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="evt-desc">Description</Label>
            <Textarea
              id="evt-desc"
              placeholder="Add description"
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.title.trim()}
          >
            {saveMutation.isPending ? (
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-4 animate-spin" />
                Saving…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4" />
                {mode === "edit" ? "Save changes" : "Create event"}
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function CalendarState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}
