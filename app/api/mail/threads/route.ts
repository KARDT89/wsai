import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"
import { getSyncStatus, type SyncStatusMetadata } from "@/lib/sync-status"
import { gmailMailboxes, type GmailMailbox } from "@/lib/corsair/sync"
import type { CacheMetadata, MailMessage, MailThread } from "@/lib/workspace-types"

const SYSTEM_LABELS = new Set([
  "INBOX", "SENT", "DRAFT", "TRASH", "SPAM",
  "UNREAD", "STARRED", "IMPORTANT", "SNOOZED",
  "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES", "CATEGORY_FORUMS",
])

const MAILBOX_LABEL: Record<string, string | undefined> = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  trash: "TRASH",
  spam: "SPAM",
  starred: "STARRED",
  snoozed: "SNOOZED",
  all: undefined,
}

export async function GET(request: Request) {
  const session = await getCurrentSession()
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const mailbox = getMailboxParam(request)
  const labelFilter = MAILBOX_LABEL[mailbox]

  const [rows, syncStatus] = await Promise.all([
    prisma.corsairEntity.findMany({
      where: {
        account: {
          tenantId: session.user.id,
          integration: { name: "gmail" },
        },
      },
      select: { entityId: true, entityType: true, data: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    }),
    getSyncStatus(session.user.id, "gmail", mailbox),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asAny = (x: unknown) => x as any

  const msgRows = rows.filter((r) => r.entityType === "messages" || r.entityType.includes("message"))
  const threadRows = rows.filter((r) => r.entityType === "threads" || r.entityType.includes("thread"))

  let threads: MailThread[]

  if (msgRows.length > 0) {
    // Primary path: individual message entities (have extracted from/subject/body fields)
    const allMsgs = msgRows.map((r) => asAny(r.data)).filter((m) => m?.id)

    // Group all messages by threadId so we can attach them to threads
    const msgsByThread = new Map<string, typeof allMsgs>()
    for (const msg of allMsgs) {
      const tid = msg.threadId ?? msg.id
      if (!msgsByThread.has(tid)) msgsByThread.set(tid, [])
      msgsByThread.get(tid)!.push(msg)
    }

    // Filter to threads that match the mailbox
    const filteredThreadIds = labelFilter
      ? [...msgsByThread.entries()]
          .filter(([, msgs]) => msgs.some((m) => Array.isArray(m.labelIds) && m.labelIds.includes(labelFilter)))
          .map(([tid]) => tid)
      : [...msgsByThread.keys()]

    threads = filteredThreadIds.map((threadId) => {
      const threadMsgs = msgsByThread.get(threadId)!
      const sorted = [...threadMsgs].sort((a, b) => parseTs(b.internalDate) - parseTs(a.internalDate))
      const latest = sorted[0]
      const oldest = sorted[sorted.length - 1]
      const allLabels = [
        ...new Set(threadMsgs.flatMap((m) => (Array.isArray(m.labelIds) ? m.labelIds : []) as string[])),
      ]

      const from = latest.from ?? getHeader(latest.payload, "From") ?? ""
      const subject =
        oldest.subject ?? getHeader(oldest.payload, "Subject") ?? latest.snippet ?? "(no subject)"

      return {
        id: threadId,
        corsairId: threadId,
        sender: parseName(from),
        email: parseEmail(from),
        subject,
        snippet: latest.snippet ?? "",
        time: formatTs(latest.internalDate),
        timestamp: String(latest.internalDate ?? ""),
        unread: allLabels.includes("UNREAD"),
        starred: allLabels.includes("STARRED"),
        attachment: false,
        labels: allLabels.filter((l) => !SYSTEM_LABELS.has(l)),
        systemLabels: allLabels,
        messages: sorted
          .slice()
          .reverse()
          .map((m) => toMailMessage(m)),
      } satisfies MailThread
    })
  } else {
    // Fallback: extract from thread entities (messages[] embedded in thread data)
    threads = threadRows
      .map((r) => {
        const data = asAny(r.data)
        const rawMsgs: unknown[] = Array.isArray(data?.messages) ? data.messages : []
        const sorted = rawMsgs.map(asRecord).sort(
          (a, b) => parseTs(b.internalDate) - parseTs(a.internalDate)
        )
        const latest = sorted[0] ?? {}
        const oldest = sorted[sorted.length - 1] ?? {}
        const allLabels = [
          ...new Set(
            sorted.flatMap((m) => (Array.isArray(m.labelIds) ? m.labelIds : []) as string[])
          ),
        ]

        if (labelFilter && !allLabels.includes(labelFilter)) return null

        const from = String(getHeader(latest.payload, "From") ?? latest.from ?? "")
        const subject =
          String(getHeader(oldest.payload, "Subject") ?? oldest.subject ?? data?.snippet ?? "(no subject)")

        const thread: MailThread = {
          id: r.entityId,
          corsairId: r.entityId,
          sender: parseName(from),
          email: parseEmail(from),
          subject,
          snippet: String(data?.snippet ?? latest.snippet ?? ""),
          time: formatTs(latest.internalDate ?? r.updatedAt.toISOString()),
          timestamp: String(latest.internalDate ?? r.updatedAt.toISOString()),
          unread: allLabels.includes("UNREAD"),
          starred: allLabels.includes("STARRED"),
          attachment: false,
          labels: allLabels.filter((l) => !SYSTEM_LABELS.has(l)),
          systemLabels: allLabels,
          messages: sorted
            .slice()
            .reverse()
            .map((m) => toMailMessage(m)),
        }
        return thread
      })
      .filter((t): t is MailThread => t !== null)
  }

  threads.sort((a, b) => parseTs(b.timestamp) - parseTs(a.timestamp))

  return Response.json(
    { threads, cache: toCacheMetadata(syncStatus, threads.length) },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMailMessage(m: any): MailMessage {
  const from = m.from ?? getHeader(m.payload, "From") ?? ""
  const ts = String(m.internalDate ?? "")
  const { bodyText, bodyHtml } = extractBody(m.payload)
  return {
    id: String(m.id ?? ""),
    author: parseName(from),
    email: parseEmail(from),
    meta: ts ? formatTs(ts) : "",
    body: m.body ?? bodyText ?? m.snippet ?? "",
    bodyText: bodyText ?? m.body,
    bodyHtml,
    timestamp: ts,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): { bodyText?: string; bodyHtml?: string } {
  if (!payload) return {}
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, "base64").toString("utf-8")
    if (payload.mimeType === "text/html") return { bodyHtml: decoded }
    return { bodyText: decoded }
  }
  if (Array.isArray(payload.parts)) {
    let bodyText: string | undefined
    let bodyHtml: string | undefined
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data && !bodyText) {
        bodyText = Buffer.from(part.body.data, "base64").toString("utf-8")
      } else if (part.mimeType === "text/html" && part.body?.data && !bodyHtml) {
        bodyHtml = Buffer.from(part.body.data, "base64").toString("utf-8")
      } else if (part.mimeType?.startsWith("multipart/") && !bodyText && !bodyHtml) {
        const nested = extractBody(part)
        bodyText = nested.bodyText
        bodyHtml = nested.bodyHtml
      }
    }
    return { bodyText, bodyHtml }
  }
  return {}
}

function getMailboxParam(request: Request): GmailMailbox {
  const v = new URL(request.url).searchParams.get("mailbox")
  return gmailMailboxes.includes(v as GmailMailbox) ? (v as GmailMailbox) : "inbox"
}

function getHeader(payload: unknown, name: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined
  const headers = (payload as Record<string, unknown>).headers
  if (!Array.isArray(headers)) return undefined
  const lower = name.toLowerCase()
  return headers.find((h: unknown) => {
    if (!h || typeof h !== "object") return false
    return String((h as Record<string, unknown>).name ?? "").toLowerCase() === lower
  })?.value as string | undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function parseName(from: string): string {
  const m = from.match(/^([^<]+)</)
  return m ? m[1].trim() : from.split("@")[0] || from
}

function parseEmail(from: string): string | undefined {
  const m = from.match(/<([^>]+)>/)
  return m ? m[1] : from.includes("@") ? from : undefined
}

function parseTs(v: unknown): number {
  if (!v) return 0
  if (v instanceof Date) return v.getTime()
  const s = String(v)
  const n = Number(s)
  if (!isNaN(n) && n > 1e12) return n
  const d = new Date(s)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

function formatTs(v: unknown): string {
  const ms = parseTs(v)
  if (!ms) return ""
  const d = new Date(ms)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  })
}

function toCacheMetadata(status: SyncStatusMetadata | null, itemCount: number): CacheMetadata {
  return {
    lastSyncedAt: status?.lastSyncedAt ?? null,
    lastStartedAt: status?.lastStartedAt ?? null,
    lastFailedAt: status?.lastFailedAt ?? null,
    lastError: status?.lastError ?? null,
    status: status?.status ?? "idle",
    reason: status?.reason ?? null,
    itemCount: status?.itemCount ?? itemCount,
  }
}
