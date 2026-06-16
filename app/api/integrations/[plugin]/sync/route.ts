import { NextResponse, type NextRequest } from "next/server"

import {
  ensureCorsairSetup,
  isKnownCorsairPlugin,
} from "@/lib/corsair/server"
import { isSyncableCorsairPlugin } from "@/lib/corsair/sync"
import { enqueueCorsairSync } from "@/inngest/events"
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

  if (!isKnownCorsairPlugin(plugin) || !isSyncableCorsairPlugin(plugin)) {
    return NextResponse.json({ error: "Unknown integration" }, { status: 404 })
  }

  try {
    await ensureCorsairSetup(session.user.id)
    await enqueueCorsairSync({
      tenantId: session.user.id,
      plugin,
      reason: "manual",
    })

    return NextResponse.json({ queued: true, plugin })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to queue sync.",
      },
      { status: 500 }
    )
  }
}
