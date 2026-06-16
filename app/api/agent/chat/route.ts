import { NextResponse } from "next/server"

import { streamWsaiAgent } from "@/server/agent/run-agent"
import { getCurrentSession } from "@/lib/session"

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

  const fullPrompt = context
    ? `Context:\n${context}\n\nUser message:\n${prompt}`
    : prompt

  try {
    const result = await streamWsaiAgent(session.user.id, fullPrompt, model)
    const nodeStream = result.toTextStream({ compatibleWithNodeStreams: true })
    const encoder = new TextEncoder()

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of nodeStream) {
            controller.enqueue(
              encoder.encode(typeof chunk === "string" ? chunk : String(chunk))
            )
          }
        } finally {
          controller.close()
        }
      },
    })

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Agent error" },
      { status: 500 }
    )
  }
}
