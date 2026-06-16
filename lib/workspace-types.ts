export type MailMessage = {
  id: string
  author: string
  email?: string
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
  description?: string
  calendar: string
}
