import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

export async function GET() {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sessions = await prisma.agentSession.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, model: true, createdAt: true, updatedAt: true },
    take: 50,
  })

  return NextResponse.json({ sessions })
}

export async function POST(req: Request) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as { title: string; model: string; messages: unknown[] }

  const agentSession = await prisma.agentSession.create({
    data: {
      userId: session.user.id,
      title: body.title ?? "New conversation",
      model: body.model,
      messages: (body.messages ?? []) as never,
    },
  })

  return NextResponse.json({ session: agentSession })
}
