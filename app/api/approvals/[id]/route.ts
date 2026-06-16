import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

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
  const body = (await req.json()) as { action: "approve" | "reject" }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 })
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
  await prisma.approvalRequest.deleteMany({
    where: { id, userId: session.user.id },
  })

  return NextResponse.json({ ok: true })
}
