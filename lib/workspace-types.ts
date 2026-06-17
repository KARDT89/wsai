export type MailMessage = {
  id: string
  author: string
  email?: string
  to?: string
  cc?: string
  meta: string
  body: string
  bodyHtml?: string
  bodyText?: string
  timestamp?: string
}

export type MailThread = {
  id: string
  corsairId: string
  sender: string
  email?: string
  subject: string
  snippet: string
  time: string
  timestamp?: string
  unread: boolean
  starred: boolean
  attachment: boolean
  labels: string[]
  systemLabels: string[]
  messages: MailMessage[]
}

export type CacheMetadata = {
  lastSyncedAt: string | null
  lastStartedAt?: string | null
  lastFailedAt?: string | null
  lastError?: string | null
  status?: "idle" | "running" | "success" | "failed"
  reason?: string | null
  itemCount: number
}

export type CalendarAttendee = {
  email: string
  displayName?: string
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction"
  self?: boolean
  organizer?: boolean
}

export type CalendarEvent = {
  id: string
  corsairId: string
  title: string
  startsAt?: string
  endsAt?: string
  day: string
  time: string
  location?: string
  meetingLink?: string
  attendees: string[]
  attendeeDetails: CalendarAttendee[]
  myResponseStatus?: CalendarAttendee["responseStatus"]
  iAmOrganizer?: boolean
  description?: string
  calendar: string
}
