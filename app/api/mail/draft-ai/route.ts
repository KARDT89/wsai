import { NextResponse } from "next/server"
import OpenAI from "openai"

import { getCurrentSession } from "@/lib/session"
import { prisma } from "@/lib/db"
import type { MailThread } from "@/lib/workspace-types"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json() as { thread: MailThread }
  const { thread } = body

  if (!thread) {
    return NextResponse.json({ error: "thread is required" }, { status: 400 })
  }

  // Get user's API key and tone preference
  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { apiKey: true, apiKeyProvider: true, aiTone: true },
  })

  const apiKey = settings?.apiKey?.trim() || process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 })
  }

  const isOpenRouter = !settings?.apiKey || settings.apiKeyProvider === "openrouter"
  const client = new OpenAI({
    apiKey,
    baseURL: isOpenRouter ? "https://openrouter.ai/api/v1" : undefined,
  })

  const tone = settings?.aiTone ?? "professional"
  const toneInstruction =
    tone === "casual"
      ? "Write in a casual, friendly tone."
      : tone === "concise"
        ? "Write in a very concise, direct tone. No pleasantries."
        : "Write in a professional, courteous tone."

  // Build context from the last 3 messages of the thread
  const recentMessages = thread.messages.slice(-3)
  const threadContext = recentMessages
    .map((m) => `From: ${m.author}\n${m.bodyText ?? m.body}`)
    .join("\n\n---\n\n")

  const systemPrompt = `You are drafting an email reply on behalf of the user. ${toneInstruction}

Rules:
- Write only the reply body — no subject line, no "To:", no signature placeholder.
- Do not start with "I hope this email finds you well" or similar filler.
- Match the length of the conversation — short if the original is short.
- Do not make up facts or commitments the user hasn't confirmed.
- End naturally; do not add a sign-off like "Best regards" unless appropriate.`

  const userPrompt = `Thread subject: ${thread.subject}

Recent messages:
${threadContext}

Draft a reply to this email thread.`

  try {
    const completion = await client.chat.completions.create({
      model: isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    })

    const draft = completion.choices[0]?.message?.content?.trim() ?? ""
    return NextResponse.json({ draft })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI draft failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
