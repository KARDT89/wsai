import { NextResponse } from "next/server"

import { requestReliableSync } from "@/lib/corsair/reliable-sync"
import { ensureCorsairSetup } from "@/lib/corsair/server"
import { getCurrentSession } from "@/lib/session"

export async function POST() {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await ensureCorsairSetup(session.user.id)
    const result = await requestReliableSync({
      tenantId: session.user.id,
      plugin: "googlecalendar",
      reason: "manual",
      inlineFallback: true,
      enqueue: false,
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed." },
      { status: 500 }
    )
  }
}
