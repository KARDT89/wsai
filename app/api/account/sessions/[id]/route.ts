import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

type Params = {
  params: Promise<{
    id: string
  }>
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const result = await prisma.session.deleteMany({
    where: {
      id,
      userId: session.user.id,
    },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 })
  }

  return NextResponse.json({
    revoked: true,
    current: id === session.session.id,
  })
}
