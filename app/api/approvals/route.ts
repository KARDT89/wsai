import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

type CorsairPermissionRow = {
  id: string
  created_at: Date
  updated_at: Date
  token: string
  plugin: string
  endpoint: string
  args: string
  tenant_id: string
  status: string
  expires_at: string
  error: string | null
}

export async function GET(req: Request) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const statusParam = url.searchParams.get("status")
  const status =
    statusParam && statusParam !== "all" ? statusParam : null
  const take = Math.min(Number(url.searchParams.get("take") ?? "50"), 100)

  const [approvals, pendingCount] = await Promise.all([
    getCorsairApprovals(session.user.id, status, take),
    countPendingCorsairApprovals(session.user.id),
  ])

  return NextResponse.json({
    approvals,
    pendingCount,
  })
}

export async function POST() {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json(
    { error: "Approvals are created by Corsair permissions." },
    { status: 410 }
  )
}

async function getCorsairApprovals(
  tenantId: string,
  status: string | null,
  take: number
) {
  try {
    const rows =
      status === "pending"
        ? await prisma.$queryRaw<CorsairPermissionRow[]>`
            SELECT *
            FROM corsair_permissions
            WHERE tenant_id = ${tenantId}
              AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT ${take}
          `
        : await prisma.$queryRaw<CorsairPermissionRow[]>`
            SELECT *
            FROM corsair_permissions
            WHERE tenant_id = ${tenantId}
            ORDER BY created_at DESC
            LIMIT ${take}
          `

    return rows
      .map(mapCorsairPermissionToApproval)
      .filter((approval) => !status || approval.status === status)
  } catch {
    return []
  }
}

async function countPendingCorsairApprovals(tenantId: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM corsair_permissions
      WHERE tenant_id = ${tenantId}
        AND status = 'pending'
    `

    return Number(rows[0]?.count ?? 0)
  } catch {
    return 0
  }
}

function mapCorsairPermissionToApproval(row: CorsairPermissionRow) {
  return {
    id: `corsair:${row.id}`,
    plugin: row.plugin,
    operation: row.endpoint,
    description: describeCorsairPermission(row),
    inputJson: parseJsonRecord(row.args),
    status: mapCorsairStatus(row.status),
    error: row.error,
    decidedAt:
      row.status === "pending" ? null : new Date(row.updated_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function describeCorsairPermission(row: CorsairPermissionRow) {
  const input = parseJsonRecord(row.args)
  const event = asRecord(input.event)
  const summary = getString(event, "summary")

  if (row.plugin === "gmail") {
    if (row.endpoint === "messages.send") return "Send a Gmail message"
    if (row.endpoint === "drafts.create") return "Save a Gmail draft"
    if (row.endpoint === "drafts.send") return "Send a Gmail draft"
    if (row.endpoint.includes(".trash")) return "Move a Gmail item to trash"
    if (row.endpoint.includes(".delete")) return "Permanently delete a Gmail item"
    if (row.endpoint.includes(".modify")) return "Update Gmail labels or read state"
    return `Gmail wants to run ${row.endpoint}`
  }

  if (row.plugin === "googlecalendar") {
    if (row.endpoint === "events.create") {
      return summary ? `Create calendar event: ${summary}` : "Create a calendar event"
    }
    if (row.endpoint === "events.update") {
      return summary ? `Update calendar event: ${summary}` : "Update a calendar event"
    }
    if (row.endpoint === "events.delete") return "Delete a calendar event"
    return `Google Calendar wants to run ${row.endpoint}`
  }

  return `${row.plugin} wants to run ${row.endpoint}`
}

function mapCorsairStatus(status: string) {
  if (status === "pending") return "pending"
  if (status === "denied") return "rejected"
  if (status === "failed" || status === "expired") return "failed"
  return "approved"
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function getString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" && value.trim() ? value : null
}
