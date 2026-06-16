import { prisma } from "@/lib/db"
import type { CalendarEvent, MailMessage, MailThread } from "@/lib/workspace-types"

type CachedEntity = {
  id: string
  entityId: string
  entityType: string
  updatedAt: Date
  data: unknown
}

type JsonRecord = Record<string, unknown>

const GMAIL_THREAD_TYPES = new Set([
  "thread",
  "threads",
  "gmail.thread",
  "gmail.threads",
  "gmail_thread",
  "gmail_threads",
])

const GMAIL_MESSAGE_TYPES = new Set([
  "message",
  "messages",
  "gmail.message",
  "gmail.messages",
  "gmail_message",
  "gmail_messages",
])

const CALENDAR_EVENT_TYPES = new Set([
  "event",
  "events",
  "calendar.event",
  "calendar.events",
  "googlecalendar.event",
  "googlecalendar.events",
  "google_calendar_event",
  "google_calendar_events",
])

export async function getCachedMailThreads(
  tenantId: string
): Promise<MailThread[]> {
  const entities = await getEntitiesForIntegration(tenantId, "gmail")
  const threadEntities = entities.filter((entity) =>
    GMAIL_THREAD_TYPES.has(normalizeType(entity.entityType))
  )
  const messageEntities = entities.filter((entity) =>
    GMAIL_MESSAGE_TYPES.has(normalizeType(entity.entityType))
  )

  if (threadEntities.length > 0) {
    return threadEntities
      .map((entity) => mapThreadEntity(entity, messageEntities))
      .sort(compareMailThreads)
  }

  return mapMessagesToThreads(messageEntities).sort(compareMailThreads)
}

export async function getCachedCalendarEvents(
  tenantId: string
): Promise<CalendarEvent[]> {
  const entities = await getEntitiesForIntegration(tenantId, "googlecalendar")

  return entities
    .filter((entity) => CALENDAR_EVENT_TYPES.has(normalizeType(entity.entityType)))
    .map(mapCalendarEntity)
    .sort((a, b) => {
      const left = a.startsAt ? new Date(a.startsAt).getTime() : 0
      const right = b.startsAt ? new Date(b.startsAt).getTime() : 0
      return left - right
    })
}

async function getEntitiesForIntegration(
  tenantId: string,
  integrationName: string
): Promise<CachedEntity[]> {
  const rows = await prisma.corsairEntity.findMany({
    where: {
      account: {
        tenantId,
        integration: {
          name: integrationName,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  })

  return rows.map((row) => ({
    id: row.id,
    entityId: row.entityId,
    entityType: row.entityType,
    updatedAt: row.updatedAt,
    data: row.data,
  }))
}

function mapThreadEntity(
  entity: CachedEntity,
  messageEntities: CachedEntity[]
): MailThread {
  const data = asRecord(entity.data)
  const rawMessages = getArray(data, "messages")
  const messages =
    rawMessages.length > 0
      ? rawMessages.map((message, index) =>
          mapMailMessage(
            String(getString(asRecord(message), "id") ?? `${entity.entityId}-${index}`),
            asRecord(message),
            entity.updatedAt
          )
        )
      : messageEntities
          .filter((messageEntity) => {
            const message = asRecord(messageEntity.data)
            return getThreadId(message, messageEntity.entityId) === entity.entityId
          })
          .map((messageEntity) =>
            mapMailMessage(
              messageEntity.entityId,
              asRecord(messageEntity.data),
              messageEntity.updatedAt
            )
          )

  const latestMessage = latestMailMessage(messages)
  const labelIds = getStringArray(data, "labelIds", "label_ids", "labels")
  const subject =
    getHeader(data, "Subject") ??
    getString(data, "subject") ??
    latestMessage?.body.slice(0, 72) ??
    "(no subject)"
  const fromHeader =
    getHeader(data, "From") ??
    getString(data, "from", "sender", "fromEmail") ??
    latestMessage?.author
  const parsedSender = parseAddress(fromHeader)
  const timestamp =
    getString(data, "lastMessageAt", "last_message_at", "internalDate", "date") ??
    latestMessage?.timestamp ??
    entity.updatedAt.toISOString()

  return {
    id: entity.id,
    corsairId: entity.entityId,
    sender: parsedSender.name || latestMessage?.author || "Unknown sender",
    email: parsedSender.email || latestMessage?.email,
    subject,
    snippet: getString(data, "snippet", "preview") ?? latestMessage?.body ?? "",
    time: formatMailboxTime(timestamp),
    timestamp,
    unread: labelIds.includes("UNREAD") || getBoolean(data, "isUnread", "unread"),
    starred: labelIds.includes("STARRED") || getBoolean(data, "starred"),
    attachment:
      getBoolean(data, "hasAttachment", "has_attachment") ||
      hasAttachments(data) ||
      messages.some((message) => message.body.toLowerCase().includes("attached")),
    labels: normalizeLabels(labelIds),
    messages:
      messages.length > 0
        ? messages.sort(compareMailMessages)
        : [
            {
              id: entity.entityId,
              author: parsedSender.name || "Unknown sender",
              email: parsedSender.email,
              meta: formatDateTime(timestamp),
              body: getString(data, "snippet", "preview") ?? "",
              timestamp,
            },
          ],
  }
}

function mapMessagesToThreads(messageEntities: CachedEntity[]): MailThread[] {
  const grouped = new Map<string, CachedEntity[]>()

  for (const entity of messageEntities) {
    const message = asRecord(entity.data)
    const threadId = getThreadId(message, entity.entityId)
    const group = grouped.get(threadId) ?? []
    group.push(entity)
    grouped.set(threadId, group)
  }

  return [...grouped.entries()].map(([threadId, entities]) => {
    const messages = entities.map((entity) =>
      mapMailMessage(entity.entityId, asRecord(entity.data), entity.updatedAt)
    )
    const latest = latestMailMessage(messages)
    const latestEntity =
      entities.find((entity) => entity.entityId === latest?.id) ?? entities[0]
    const data = asRecord(latestEntity.data)
    const labelIds = getStringArray(data, "labelIds", "label_ids", "labels")
    const fromHeader =
      getHeader(data, "From") ?? getString(data, "from", "sender", "fromEmail")
    const parsedSender = parseAddress(fromHeader)
    const timestamp =
      latest?.timestamp ??
      getString(data, "internalDate", "date") ??
      latestEntity.updatedAt.toISOString()

    return {
      id: latestEntity.id,
      corsairId: threadId,
      sender: parsedSender.name || latest?.author || "Unknown sender",
      email: parsedSender.email || latest?.email,
      subject:
        getHeader(data, "Subject") ?? getString(data, "subject") ?? "(no subject)",
      snippet: getString(data, "snippet", "preview") ?? latest?.body ?? "",
      time: formatMailboxTime(timestamp),
      timestamp,
      unread: labelIds.includes("UNREAD") || getBoolean(data, "isUnread", "unread"),
      starred: labelIds.includes("STARRED") || getBoolean(data, "starred"),
      attachment: getBoolean(data, "hasAttachment", "has_attachment") || hasAttachments(data),
      labels: normalizeLabels(labelIds),
      messages: messages.sort(compareMailMessages),
    }
  })
}

function mapMailMessage(
  id: string,
  data: JsonRecord,
  fallbackDate: Date
): MailMessage {
  const fromHeader = getHeader(data, "From") ?? getString(data, "from", "sender")
  const parsedSender = parseAddress(fromHeader)
  const timestamp =
    getString(data, "internalDate", "date", "createdAt", "created_at") ??
    fallbackDate.toISOString()

  return {
    id,
    author: parsedSender.name || getString(data, "fromName", "senderName") || "Unknown sender",
    email: parsedSender.email,
    meta: formatDateTime(timestamp),
    body:
      getString(data, "body", "text", "plainText", "snippet", "preview") ??
      getPayloadText(data) ??
      "",
    timestamp,
  }
}

function mapCalendarEntity(entity: CachedEntity): CalendarEvent {
  const data = asRecord(entity.data)
  const start = asRecord(data.start)
  const end = asRecord(data.end)
  const startsAt =
    getString(start, "dateTime", "date_time", "date") ??
    getString(data, "startAt", "start_at", "startsAt")
  const endsAt =
    getString(end, "dateTime", "date_time", "date") ??
    getString(data, "endAt", "end_at", "endsAt")
  const attendees = getArray(data, "attendees")
    .map((attendee) => {
      const record = asRecord(attendee)
      return getString(record, "displayName", "display_name", "email") ?? ""
    })
    .filter(Boolean)

  return {
    id: entity.id,
    corsairId: entity.entityId,
    title: getString(data, "summary", "title", "name") ?? "(untitled event)",
    startsAt,
    endsAt,
    day: startsAt ? formatCalendarDay(startsAt) : "No date",
    time: formatCalendarRange(startsAt, endsAt),
    location: getString(data, "location"),
    meetingLink:
      getString(data, "hangoutLink", "meetingLink", "htmlLink") ??
      getConferenceLink(data),
    attendees,
    description: getString(data, "description"),
    calendar: getString(data, "calendarId", "calendar_id") ?? "Google Calendar",
  }
}

function normalizeType(entityType: string) {
  return entityType.toLowerCase().replaceAll("/", ".")
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function getString(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
    if (typeof value === "number") return String(value)
  }
}

function getBoolean(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "boolean") return value
  }
  return false
}

function getArray(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function getStringArray(record: JsonRecord, ...keys: string[]) {
  return getArray(record, ...keys)
    .map((value) => (typeof value === "string" ? value : undefined))
    .filter((value): value is string => Boolean(value))
}

function getHeader(record: JsonRecord, name: string) {
  const headers = getArray(asRecord(record.payload), "headers")

  for (const header of headers) {
    const item = asRecord(header)
    if (getString(item, "name")?.toLowerCase() === name.toLowerCase()) {
      return getString(item, "value")
    }
  }
}

function getThreadId(record: JsonRecord, fallback: string) {
  return getString(record, "threadId", "thread_id") ?? fallback
}

function parseAddress(value?: string) {
  if (!value) return { name: "", email: "" }

  const match = value.match(/^(.*?)\s*<([^>]+)>$/)
  if (!match) {
    return value.includes("@")
      ? { name: value.split("@")[0] ?? value, email: value }
      : { name: value, email: "" }
  }

  return {
    name: match[1]?.replaceAll("\"", "").trim() ?? "",
    email: match[2]?.trim() ?? "",
  }
}

function normalizeLabels(labels: string[]) {
  return labels
    .filter((label) => !["INBOX", "UNREAD", "STARRED", "SENT"].includes(label))
    .map((label) => label.replaceAll("_", " ").toLowerCase())
    .slice(0, 3)
}

function hasAttachments(record: JsonRecord): boolean {
  const payload = asRecord(record.payload)
  const parts = getArray(payload, "parts")
  return parts.some((part) => Boolean(getString(asRecord(part), "filename")))
}

function getPayloadText(record: JsonRecord): string | undefined {
  const payload = asRecord(record.payload)
  const body = asRecord(payload.body)
  const bodyData = getString(body, "data")

  if (bodyData) return decodeBase64Url(bodyData)

  for (const part of getArray(payload, "parts")) {
    const partRecord = asRecord(part)
    const mimeType = getString(partRecord, "mimeType")
    if (mimeType === "text/plain") {
      const data = getString(asRecord(partRecord.body), "data")
      if (data) return decodeBase64Url(data)
    }
  }
}

function decodeBase64Url(value: string) {
  try {
    return Buffer.from(
      value.replaceAll("-", "+").replaceAll("_", "/"),
      "base64"
    ).toString("utf8")
  } catch {
    return undefined
  }
}

function getConferenceLink(record: JsonRecord) {
  const entryPoints = getArray(asRecord(record.conferenceData), "entryPoints")
  for (const entryPoint of entryPoints) {
    const link = getString(asRecord(entryPoint), "uri")
    if (link) return link
  }
}

function latestMailMessage(messages: MailMessage[]) {
  return [...messages].sort(compareMailMessages).at(-1)
}

function compareMailMessages(a: MailMessage, b: MailMessage) {
  return toTime(a.timestamp) - toTime(b.timestamp)
}

function compareMailThreads(a: MailThread, b: MailThread) {
  return toTime(b.timestamp) - toTime(a.timestamp)
}

function toTime(value?: string) {
  if (!value) return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return numeric > 1000000000000 ? numeric : numeric * 1000
  }
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMailboxTime(value?: string) {
  const time = toTime(value)
  if (!time) return ""
  const date = new Date(time)
  const now = new Date()

  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date)
}

function formatDateTime(value?: string) {
  const time = toTime(value)
  if (!time) return ""
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time))
}

function formatCalendarDay(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(toTime(value)))
}

function formatCalendarRange(startsAt?: string, endsAt?: string) {
  if (!startsAt) return "Any time"
  const formatter = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  })
  const start = formatter.format(new Date(toTime(startsAt)))
  const end = endsAt ? formatter.format(new Date(toTime(endsAt))) : undefined
  return end ? `${start} - ${end}` : start
}
