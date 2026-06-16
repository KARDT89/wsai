import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"
import { streamWsaiAgentEvents } from "@/server/agent/run-agent"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as { prompt?: string; context?: string; model?: string }
  const { prompt, context, model } = body

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
  }

  // Load user's custom API key (single DB read, cached at the row level by Prisma)
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { apiKey: true, apiKeyProvider: true },
  })

  const fullPrompt = context
    ? `Context:\n${context}\n\nUser message:\n${prompt}`
    : prompt

  try {
    const eventStream = streamWsaiAgentEvents(
      session.user.id,
      fullPrompt,
      model,
      userSettings ?? undefined
    )
    const encoder = new TextEncoder()

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of eventStream) {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
          }
        } catch (err) {
          // Stream an error event so the client shows something meaningful
          const errorEvent = {
            type: "text",
            delta: `\n\n_Error: ${err instanceof Error ? err.message : "Agent failed"}_`,
          }
          controller.enqueue(encoder.encode(JSON.stringify(errorEvent) + "\n"))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(responseStream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Agent error" },
      { status: 500 }
    )
  }
}
