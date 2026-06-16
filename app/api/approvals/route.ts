import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

export async function GET(req: Request) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get("status") // "pending" | "approved" | "rejected" | all
  const take = Math.min(Number(url.searchParams.get("take") ?? "50"), 100)

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  })

  const pendingCount = await prisma.approvalRequest.count({
    where: { userId: session.user.id, status: "pending" },
  })

  return NextResponse.json({ approvals, pendingCount })
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
