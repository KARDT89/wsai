import { NextResponse, type NextRequest } from "next/server"

import {
  ensureCorsairSetup,
  isKnownCorsairPlugin,
} from "@/lib/corsair/server"
import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ plugin: string }> }
) {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { plugin } = await params

  if (!isKnownCorsairPlugin(plugin)) {
    return NextResponse.json({ error: "Unknown integration" }, { status: 404 })
  }

  try {
    await ensureCorsairSetup(session.user.id)
    const account = await prisma.corsairAccount.findFirst({
      where: {
        tenantId: session.user.id,
        integration: {
          name: plugin,
        },
      },
      select: {
        id: true,
      },
    })

    if (!account) {
      return NextResponse.json({ disconnected: true })
    }

    await prisma.$transaction([
      prisma.corsairEntity.deleteMany({
        where: {
          accountId: account.id,
        },
      }),
      prisma.corsairEvent.deleteMany({
        where: {
          accountId: account.id,
        },
      }),
      prisma.corsairAccount.update({
        where: {
          id: account.id,
        },
        data: {
          config: {},
        },
      }),
    ])

    return NextResponse.json({ disconnected: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to disconnect integration.",
      },
      { status: 500 }
    )
  }
}
