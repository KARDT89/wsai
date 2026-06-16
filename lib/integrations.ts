export type IntegrationDefinition = {
  id: string
  name: string
  description: string
  surface: string
  enabled: boolean
}

export const integrationDefinitions: IntegrationDefinition[] = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Read inbox threads, labels, drafts, and messages through Corsair.",
    surface: "Mail",
    enabled: true,
  },
  {
    id: "googlecalendar",
    name: "Google Calendar",
    description: "Sync upcoming events into the calendar workspace.",
    surface: "Calendar",
    enabled: true,
  },
]
