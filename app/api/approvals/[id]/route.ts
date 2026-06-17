import { executePermission } from "corsair"
import { NextResponse } from "next/server"

import { enqueueCorsairSync } from "@/inngest/events"
import { getCorsairInstance } from "@/lib/corsair/server"
import {
  isSyncableCorsairPlugin,
  type GmailMailbox,
  type SyncableCorsairPluginId,
} from "@/lib/corsair/sync"
import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }
type ApprovalAction = "approve" | "reject"
type CorsairPermissionRow = {
  id: string
  token: string
  plugin: string
  endpoint: string
  args: string
  tenant_id: string
  status: string
  created_at: Date
  updated_at: Date
  error?: string | null
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = (await req.json()) as { action: ApprovalAction }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 })
  }

  if (id.startsWith("corsair:")) {
    return handleCorsairPermission(id.slice("corsair:".length), session.user.id, body.action)
  }

  return NextResponse.json(
    { error: "Only Corsair permission approvals are supported." },
    { status: 404 }
  )
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (id.startsWith("corsair:")) {
    await prisma.$executeRaw`
      DELETE FROM corsair_permissions
      WHERE id = ${id.slice("corsair:".length)}
        AND tenant_id = ${session.user.id}
    `

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json(
    { error: "Only Corsair permission approvals are supported." },
    { status: 404 }
  )
}

async function handleCorsairPermission(
  id: string,
  tenantId: string,
  action: ApprovalAction
) {
  const rows = await prisma.$queryRaw<CorsairPermissionRow[]>`
    SELECT *
    FROM corsair_permissions
    WHERE id = ${id}
      AND tenant_id = ${tenantId}
    LIMIT 1
  `
  const permission = rows[0]

  if (!permission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (permission.status !== "pending") {
    return NextResponse.json({ error: "Already decided" }, { status: 409 })
  }

  if (action === "reject") {
    await prisma.$executeRaw`
      UPDATE corsair_permissions
      SET status = 'denied',
          updated_at = NOW()
      WHERE id = ${id}
        AND tenant_id = ${tenantId}
    `

    return NextResponse.json({
      approval: mapCorsairPermission(permission, "denied"),
    })
  }

  await prisma.$executeRaw`
    UPDATE corsair_permissions
    SET status = 'approved',
        updated_at = NOW()
    WHERE id = ${id}
      AND tenant_id = ${tenantId}
  `

  let result: Awaited<ReturnType<typeof executePermission>>
  try {
    result = await executePermission(getCorsairInstance(), permission.token)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Execution threw unexpectedly"
    await prisma.$executeRaw`
      UPDATE corsair_permissions
      SET status = 'failed',
          error = ${errMsg},
          updated_at = NOW()
      WHERE id = ${id}
        AND tenant_id = ${tenantId}
    `
    return NextResponse.json(
      { error: errMsg, approval: mapCorsairPermission(permission, "failed") },
      { status: 500 }
    )
  }
  const ok = !result.error
  const finalStatus = ok ? "completed" : "failed"

  if (ok) {
    enqueueApprovalSync(tenantId, permission.plugin, permission.endpoint).catch((err) =>
      console.error("[approvals] sync enqueue failed:", err)
    )
  }

  await prisma.$executeRaw`
    UPDATE corsair_permissions
    SET status = ${finalStatus},
        error = ${ok ? null : String(result.error ?? "Execution failed")},
        updated_at = NOW()
    WHERE id = ${id}
      AND tenant_id = ${tenantId}
  `

  if (!ok) {
    return NextResponse.json(
      {
        error: result.error ?? "Execution failed",
        approval: mapCorsairPermission(permission, finalStatus),
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    approval: mapCorsairPermission(permission, finalStatus),
  })
}

function mapCorsairPermission(
  permission: CorsairPermissionRow,
  status: string
) {
  return {
    id: `corsair:${permission.id}`,
    plugin: permission.plugin,
    operation: permission.endpoint,
    description: describePermission(permission.plugin, permission.endpoint, parseJsonRecord(permission.args)),
    inputJson: parseJsonRecord(permission.args),
    error: permission.error ?? null,
    status:
      status === "denied"
        ? "rejected"
        : status === "failed" || status === "expired"
          ? "failed"
          : status === "pending"
            ? "pending"
            : "approved",
    decidedAt: status === "pending" ? null : new Date().toISOString(),
    createdAt: new Date(permission.created_at).toISOString(),
  }
}

async function enqueueApprovalSync(
  tenantId: string,
  plugin: string,
  operation: string
) {
  if (!isSyncableCorsairPlugin(plugin)) return

  const mailboxes = getGmailSyncMailboxes(plugin, operation)
  if (mailboxes.length > 0) {
    await Promise.all(
      mailboxes.map((mailbox) =>
        enqueueCorsairSync({
          tenantId,
          plugin: "gmail",
          reason: "agent_action",
          mailbox,
        })
      )
    )
    return
  }

  await enqueueCorsairSync({
    tenantId,
    plugin: plugin as SyncableCorsairPluginId,
    reason: "agent_action",
  })
}

function getGmailSyncMailboxes(plugin: string, operation: string): GmailMailbox[] {
  if (plugin !== "gmail") return []
  if (operation === "messages.send" || operation === "drafts.send") return ["sent"]
  if (operation.startsWith("drafts.")) return ["drafts"]
  if (operation.endsWith(".trash")) return ["inbox", "trash"]
  if (operation.endsWith(".untrash")) return ["trash", "inbox"]
  if (operation.endsWith(".modify") || operation.endsWith(".batchModify")) {
    return ["inbox", "starred"]
  }
  return []
}

function describePermission(
  plugin: string,
  operation: string,
  input: Record<string, unknown>
) {
  const event = asRecord(input.event)
  const summary = getString(event, "summary")

  if (plugin === "gmail") {
    if (operation === "messages.send") return "Send a Gmail message"
    if (operation === "drafts.create") return "Save a Gmail draft"
    if (operation === "drafts.send") return "Send a Gmail draft"
    if (operation.includes(".trash")) return "Move a Gmail item to trash"
    if (operation.includes(".delete")) return "Permanently delete a Gmail item"
    if (operation.includes(".modify")) return "Update Gmail labels or read state"
    return `Gmail wants to run ${operation}`
  }

  if (plugin === "googlecalendar") {
    if (operation === "events.create") {
      return summary ? `Create calendar event: ${summary}` : "Create a calendar event"
    }
    if (operation === "events.update") {
      return summary ? `Update calendar event: ${summary}` : "Update a calendar event"
    }
    if (operation === "events.delete") return "Delete a calendar event"
    return `Google Calendar wants to run ${operation}`
  }

  return `${plugin} wants to run ${operation}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function getString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" && value.trim() ? value : null
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed }
  } catch {
    return { value }
  }
}
