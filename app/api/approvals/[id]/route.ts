import { executePermission } from "corsair"
import { NextResponse } from "next/server"

import { getCorsairInstance } from "@/lib/corsair/server"
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
}

/**
 * Execute an approved operation via the appropriate internal API route.
 * Each plugin+operation maps to a known internal endpoint.
 */
async function executeApproved(
  userId: string,
  plugin: string,
  operation: string,
  input: Record<string, unknown>,
  origin: string
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = origin

  try {
    if (plugin === "gmail" && operation === "messages.send") {
      const res = await fetch(`${baseUrl}/api/mail/send`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-approval-exec": "1" },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        return { ok: false, error: err.error ?? "Send failed" }
      }
      return { ok: true }
    }

    if (plugin === "gmail" && (operation === "threads.delete" || operation === "threads.trash")) {
      const res = await fetch(`${baseUrl}/api/mail/action`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-approval-exec": "1" },
        body: JSON.stringify({ action: "trash", threadId: input.id ?? input.threadId }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        return { ok: false, error: err.error ?? "Action failed" }
      }
      return { ok: true }
    }

    // For calendar operations and others — log as approved but don't auto-execute yet.
    // These will be executed by the agent on the next invocation.
    // TODO: add calendar event execution once /api/calendar/events supports POST
    console.log(`[approvals] approved ${plugin}/${operation} for user ${userId}`, input)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Execution failed" }
  }
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

  const existing = await prisma.approvalRequest.findUnique({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (existing.status !== "pending") {
    return NextResponse.json({ error: "Already decided" }, { status: 409 })
  }

  if (body.action === "reject") {
    const updated = await prisma.approvalRequest.update({
      where: { id },
      data: { status: "rejected", decidedAt: new Date() },
    })
    return NextResponse.json({ approval: updated })
  }

  // Approve: try to execute, then update status
  const origin = new URL(req.url).origin
  const result = await executeApproved(
    session.user.id,
    existing.plugin,
    existing.operation,
    existing.inputJson as Record<string, unknown>,
    origin
  )

  const newStatus = result.ok ? "approved" : "failed"
  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: { status: newStatus, decidedAt: new Date() },
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error, approval: updated }, { status: 500 })
  }

  return NextResponse.json({ approval: updated })
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

  await prisma.approvalRequest.deleteMany({
    where: { id, userId: session.user.id },
  })

  return NextResponse.json({ ok: true })
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

  const result = await executePermission(getCorsairInstance(), permission.token)
  const ok = !result.error
  const finalStatus = ok ? "completed" : "failed"

  await prisma.$executeRaw`
    UPDATE corsair_permissions
    SET status = ${finalStatus},
        error = ${ok ? null : String(result.error ?? "Execution failed")},
        updated_at = NOW()
    WHERE id = ${id}
      AND tenant_id = ${tenantId}
  `

  return NextResponse.json(
    {
      approval: mapCorsairPermission(permission, finalStatus),
      result,
    },
    { status: ok ? 200 : 500 }
  )
}

function mapCorsairPermission(
  permission: CorsairPermissionRow,
  status: string
) {
  return {
    id: `corsair:${permission.id}`,
    plugin: permission.plugin,
    operation: permission.endpoint,
    description: `${permission.plugin} wants to run ${permission.endpoint}`,
    inputJson: parseJsonRecord(permission.args),
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
