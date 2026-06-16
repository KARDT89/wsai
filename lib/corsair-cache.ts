import { prisma } from "@/lib/db"
import type { GmailMailbox } from "@/lib/corsair/sync"
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

const GMAIL_DRAFT_TYPES = new Set([
  "draft",
  "drafts",
  "gmail.draft",
  "gmail.drafts",
  "gmail_draft",
  "gmail_drafts",
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
  tenantId: string,
  mailbox: GmailMailbox = "inbox"
): Promise<MailThread[]> {
  const entities = await getEntitiesForIntegration(tenantId, "gmail")
  const draftEntities = entities.filter((entity) =>
    GMAIL_DRAFT_TYPES.has(normalizeType(entity.entityType))
  )
  const threadEntities = entities.filter((entity) =>
    GMAIL_THREAD_TYPES.has(normalizeType(entity.entityType))
  )
  const messageEntities = entities.filter((entity) =>
    GMAIL_MESSAGE_TYPES.has(normalizeType(entity.entityType))
  )

  if (mailbox === "drafts") {
    return draftEntities
      .map((entity) => mapDraftEntity(entity, messageEntities))
      .sort(compareMailThreads)
  }

  if (threadEntities.length > 0) {
    return threadEntities
      .map((entity) => mapThreadEntity(entity, messageEntities))
      .filter((thread) => matchesMailbox(thread, mailbox))
      .sort(compareMailThreads)
  }

  return mapMessagesToThreads(messageEntities)
    .filter((thread) => matchesMailbox(thread, mailbox))
    .sort(compareMailThreads)
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

  const richMessageEntities = messageEntities.filter((messageEntity) => {
    const message = asRecord(messageEntity.data)
    return getThreadId(message, messageEntity.entityId) === entity.entityId
  })
  const richMessages = richMessageEntities.map((messageEntity) =>
    mapMailMessage(
      messageEntity.entityId,
      asRecord(messageEntity.data),
      messageEntity.updatedAt
    )
  )
  const displayMessages = richMessages.length > 0 ? richMessages : messages
  const latestMessage = latestMailMessage(displayMessages)
  const labelIds = getMessageLabels(data, richMessageEntities)
  const latestRawMessage = latestRawMailMessage(getArray(data, "messages"))
  const latestRawRecord = latestRawMessage ? asRecord(latestRawMessage) : {}
  const latestPreview =
    latestMessage?.bodyText ?? latestMessage?.body ?? stripHtml(latestMessage?.bodyHtml)
  const subject =
    getHeader(data, "Subject") ??
    getString(data, "subject") ??
    getHeader(latestRawRecord, "Subject") ??
    getString(latestRawRecord, "subject") ??
    latestPreview?.slice(0, 72) ??
    "(no subject)"
  const fromHeader =
    getHeader(data, "From") ??
    getString(data, "from", "sender", "fromEmail") ??
    getHeader(latestRawRecord, "From") ??
    getString(latestRawRecord, "from", "sender", "fromEmail") ??
    latestMessage?.author
  const parsedSender = parseAddress(fromHeader)
  const timestamp =
    getString(data, "lastMessageAt", "last_message_at", "internalDate", "date") ??
    getHeader(latestRawRecord, "Date") ??
    getString(latestRawRecord, "internalDate", "date", "createdAt") ??
    latestMessage?.timestamp ??
    entity.updatedAt.toISOString()

  return {
    id: entity.id,
    corsairId: entity.entityId,
    sender: parsedSender.name || latestMessage?.author || "Unknown sender",
    email: parsedSender.email || latestMessage?.email,
    subject,
    snippet: getString(data, "snippet", "preview") ?? latestPreview ?? "",
    time: formatMailboxTime(timestamp),
    timestamp,
    unread: labelIds.includes("UNREAD") || getBoolean(data, "isUnread", "unread"),
    starred: labelIds.includes("STARRED") || getBoolean(data, "starred"),
    attachment:
      getBoolean(data, "hasAttachment", "has_attachment") ||
      hasAttachments(data) ||
      displayMessages.some((message) => message.body.toLowerCase().includes("attached")),
    labels: normalizeLabels(labelIds),
    systemLabels: labelIds,
    messages:
      displayMessages.length > 0
        ? displayMessages.sort(compareMailMessages)
        : [
            {
              id: entity.entityId,
              author: parsedSender.name || "Unknown sender",
              email: parsedSender.email,
              meta: formatDateTime(timestamp),
              body: getString(data, "snippet", "preview") ?? "",
              bodyText: getString(data, "snippet", "preview") ?? "",
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
    const labelIds = getMessageLabels(data)
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
      systemLabels: labelIds,
      messages: messages.sort(compareMailMessages),
    }
  })
}

function mapDraftEntity(
  entity: CachedEntity,
  messageEntities: CachedEntity[]
): MailThread {
  const data = asRecord(entity.data)
  const draftMessage = asRecord(data.message)
  const messageId =
    getString(data, "messageId", "message_id") ??
    getString(draftMessage, "id") ??
    entity.entityId
  const messageEntity = messageEntities.find((candidate) => {
    const candidateData = asRecord(candidate.data)
    return (
      candidate.entityId === messageId ||
      getString(candidateData, "id") === messageId
    )
  })
  const message =
    messageEntity ? asRecord(messageEntity.data) : draftMessage
  const mappedMessage = mapMailMessage(
    messageId,
    message,
    messageEntity?.updatedAt ?? entity.updatedAt
  )
  const toHeader = getHeader(message, "To") ?? getString(message, "to")
  const parsedRecipient = parseAddress(toHeader)
  const subject =
    getHeader(message, "Subject") ?? getString(message, "subject") ?? "Draft"
  const timestamp = mappedMessage.timestamp ?? entity.updatedAt.toISOString()
  const labelIds = getMessageLabels(message, messageEntity ? [messageEntity] : [])

  return {
    id: entity.id,
    corsairId: getThreadId(message, entity.entityId),
    sender: parsedRecipient.name || parsedRecipient.email || "Draft",
    email: parsedRecipient.email,
    subject,
    snippet: mappedMessage.bodyText ?? mappedMessage.body,
    time: formatMailboxTime(timestamp),
    timestamp,
    unread: false,
    starred: labelIds.includes("STARRED"),
    attachment: hasAttachments(message),
    labels: ["draft"],
    systemLabels: [...new Set(["DRAFT", ...labelIds])],
    messages: [
      {
        ...mappedMessage,
        author: "Draft",
      },
    ],
  }
}

function mapMailMessage(
  id: string,
  data: JsonRecord,
  fallbackDate: Date
): MailMessage {
  const fromHeader =
    getHeader(data, "From") ?? getString(data, "from", "sender", "fromEmail")
  const parsedSender = parseAddress(fromHeader)
  const timestamp =
    getHeader(data, "Date") ??
    getString(data, "internalDate", "date", "createdAt", "created_at") ??
    fallbackDate.toISOString()
  const bodies = getPayloadBodies(data)
  const bodyText =
    getString(data, "body", "text", "plainText", "snippet", "preview") ??
    bodies.text
  const bodyHtml = getString(data, "html", "bodyHtml") ?? bodies.html
  const displayBody = bodyText ?? stripHtml(bodyHtml) ?? ""

  return {
    id,
    author:
      parsedSender.name ||
      parsedSender.email ||
      getString(data, "fromName", "senderName") ||
      "Unknown sender",
    email: parsedSender.email,
    meta: formatDateTime(timestamp),
    body: displayBody,
    bodyHtml,
    bodyText,
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

function latestRawMailMessage(messages: unknown[]) {
  return [...messages].sort((a, b) => {
    const left = asRecord(a)
    const right = asRecord(b)
    return (
      toTime(getHeader(left, "Date") ?? getString(left, "internalDate", "date")) -
      toTime(getHeader(right, "Date") ?? getString(right, "internalDate", "date"))
    )
  }).at(-1)
}

function getStringArray(record: JsonRecord, ...keys: string[]) {
  return getArray(record, ...keys)
    .map((value) => (typeof value === "string" ? value : undefined))
    .filter((value): value is string => Boolean(value))
}

function getMessageLabels(record: JsonRecord, entities: CachedEntity[] = []) {
  const directLabels = getStringArray(record, "labelIds", "label_ids", "labels")
  const messageLabels = getArray(record, "messages").flatMap((message) =>
    getStringArray(asRecord(message), "labelIds", "label_ids", "labels")
  )
  const entityLabels = entities.flatMap((entity) =>
    getStringArray(asRecord(entity.data), "labelIds", "label_ids", "labels")
  )

  return [...new Set([...directLabels, ...messageLabels, ...entityLabels])]
}

function matchesMailbox(thread: MailThread, mailbox: GmailMailbox) {
  const labels = new Set(thread.systemLabels)

  if (mailbox === "inbox") {
    return labels.size === 0 || (labels.has("INBOX") && !labels.has("TRASH"))
  }

  if (mailbox === "starred") return labels.has("STARRED")
  if (mailbox === "snoozed") return labels.has("SNOOZED")
  if (mailbox === "sent") return labels.has("SENT")
  if (mailbox === "trash") return labels.has("TRASH")
  return labels.has("DRAFT")
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

function getPayloadBodies(record: JsonRecord) {
  const payload = asRecord(record.payload)
  const bodies = collectPayloadBodies(payload)

  return {
    html: bodies.html.join("\n"),
    text: bodies.text.join("\n"),
  }
}

function collectPayloadBodies(part: JsonRecord): { html: string[]; text: string[] } {
  const mimeType = getString(part, "mimeType")?.toLowerCase()
  const bodyData = getString(asRecord(part.body), "data")
  const html: string[] = []
  const text: string[] = []

  if (bodyData) {
    const decoded = decodeBase64Url(bodyData)

    if (decoded && mimeType === "text/html") {
      html.push(decoded)
    } else if (decoded && mimeType === "text/plain") {
      text.push(decoded)
    }
  }

  for (const child of getArray(part, "parts")) {
    const childBodies = collectPayloadBodies(asRecord(child))
    html.push(...childBodies.html)
    text.push(...childBodies.text)
  }

  return { html, text }
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

function stripHtml(value?: string) {
  if (!value) return undefined
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
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
