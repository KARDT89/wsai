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

  const [approvalRequests, corsairApprovals] = await Promise.all([
    prisma.approvalRequest.findMany({
      where: {
        userId: session.user.id,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    getCorsairApprovals(session.user.id, status, take),
  ])

  const [pendingApprovalCount, pendingCorsairCount] = await Promise.all([
    prisma.approvalRequest.count({
      where: { userId: session.user.id, status: "pending" },
    }),
    countPendingCorsairApprovals(session.user.id),
  ])

  const approvals = [...approvalRequests, ...corsairApprovals]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, take)

  return NextResponse.json({
    approvals,
    pendingCount: pendingApprovalCount + pendingCorsairCount,
  })
}

export async function POST(req: Request) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    agentSessionId?: string
    plugin: string
    operation: string
    description: string
    inputJson: unknown
  }

  if (!body.plugin || !body.operation || !body.description) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const approval = await prisma.approvalRequest.create({
    data: {
      userId: session.user.id,
      agentSessionId: body.agentSessionId ?? null,
      plugin: body.plugin,
      operation: body.operation,
      description: body.description,
      inputJson: body.inputJson as never,
      status: "pending",
    },
  })

  return NextResponse.json({ approval })
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
    decidedAt:
      row.status === "pending" ? null : new Date(row.updated_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function describeCorsairPermission(row: CorsairPermissionRow) {
  const plugin = row.plugin === "googlecalendar" ? "Google Calendar" : "Gmail"
  return `${plugin} wants to run ${row.endpoint}`
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
