import { NextResponse } from "next/server"

import { syncCorsairPlugin } from "@/lib/corsair/sync"
import { ensureCorsairSetup } from "@/lib/corsair/server"
import { getCurrentSession } from "@/lib/session"

export async function POST() {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await ensureCorsairSetup(session.user.id)
    const result = await syncCorsairPlugin(session.user.id, "googlecalendar", "manual")
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed." },
      { status: 500 }
    )
  }
}
