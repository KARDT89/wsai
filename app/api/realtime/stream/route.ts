import { type NextRequest } from "next/server"

import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const POLL_MS = 2_000
const HEARTBEAT_MS = 25_000

type SyncRow = { plugin: string; status: string; updated_at: Date }

export async function GET(request: NextRequest) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const tenantId = session.user.id
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Track last-seen { updatedAt, status } per plugin to avoid spurious events
      const lastSeen: Record<string, { ts: number; status: string }> = {}
      let closed = false

      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      async function poll() {
        if (closed) return
        try {
          const rows = await prisma.$queryRaw<SyncRow[]>`
            SELECT plugin, status, updated_at
            FROM sync_status
            WHERE tenant_id = ${tenantId}
              AND scope = 'all'
          `
          for (const row of rows) {
            const ts = row.updated_at.getTime()
            const prev = lastSeen[row.plugin]
            if (
              prev !== undefined &&
              ts > prev.ts &&
              (row.status === "success" || row.status === "failed")
            ) {
              send("sync-complete", {
                plugin: row.plugin,
                status: row.status,
                updatedAt: row.updated_at.toISOString(),
              })
            }
            lastSeen[row.plugin] = { ts, status: row.status }
          }
        } catch {
          // Non-fatal — skip this poll cycle
        }
        if (!closed) setTimeout(() => void poll(), POLL_MS)
      }

      function heartbeat() {
        if (closed) return
        send("ping", {})
        setTimeout(heartbeat, HEARTBEAT_MS)
      }

      request.signal.addEventListener("abort", () => {
        closed = true
      })

      // Initial poll populates lastSeen baseline without emitting events
      await poll()
      heartbeat()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
