import { CalendarDaysIcon } from "@hugeicons/core-free-icons"

import type { WSAIModule } from "./types"

export const calendarModule: WSAIModule = {
  id: "calendar",
  label: "Calendar",
  corsairPlugin: "googlecalendar",

  navItems: [
    { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  ],

  commandActions: [
    {
      id: "calendar.this-week",
      label: "What's on my calendar this week?",
      group: "Calendar",
      onSelect: () => ({ type: "ai", prompt: "What's on my calendar this week?" }),
    },
    {
      id: "calendar.tomorrow",
      label: "What's on my calendar tomorrow?",
      group: "Calendar",
      onSelect: () => ({ type: "ai", prompt: "What's on my calendar tomorrow?" }),
    },
    {
      id: "calendar.schedule",
      label: "Schedule a meeting",
      group: "Calendar",
      onSelect: () => ({ type: "navigate", href: "/calendar" }),
    },
  ],

  approvalRequired: [
    {
      plugin: "googlecalendar",
      operation: "events.create",
      describe: (input) => `Create event: ${String(input.summary ?? input.title ?? "untitled")}`,
    },
    {
      plugin: "googlecalendar",
      operation: "events.update",
      describe: (input) => `Update event: ${String(input.eventId ?? input.id ?? "unknown")}`,
    },
    {
      plugin: "googlecalendar",
      operation: "events.delete",
      describe: (input) => `Delete event: ${String(input.eventId ?? input.id ?? "unknown")}`,
    },
  ],

  dbTables: ["CalendarEvent"],
}
