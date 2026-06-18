import { NextResponse, type NextRequest } from "next/server"

import {
  ensureCorsairSetup,
  isKnownCorsairPlugin,
} from "@/lib/corsair/server"
import { requestReliableSync } from "@/lib/corsair/reliable-sync"
import { isSyncableCorsairPlugin } from "@/lib/corsair/sync"
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
    const result = await requestReliableSync({
      tenantId: session.user.id,
      plugin,
      reason: "manual",
      inlineFallback: true,
      enqueue: false,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to sync integration.",
      },
      { status: 500 }
    )
  }
}
