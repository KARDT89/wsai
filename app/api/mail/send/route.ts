import { NextResponse } from "next/server"

import { enqueueCorsairSync } from "@/inngest/events"
import { createRfc822Message, encodeBase64Url } from "@/lib/mail/mime"
import { ensureCorsairSetup, getCorsairInstance } from "@/lib/corsair/server"
import { getCurrentSession } from "@/lib/session"

export async function POST(request: Request) {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = (await request.json()) as {
    to?: string
    cc?: string
    bcc?: string
    subject?: string
    body?: string
    threadId?: string
  }

  if (!payload.to || !payload.subject || !payload.body) {
    return NextResponse.json(
      { error: "To, subject, and body are required." },
      { status: 400 }
    )
  }

  try {
    await ensureCorsairSetup(session.user.id)
    const raw = encodeBase64Url(
      createRfc822Message({
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        body: payload.body,
        threadId: payload.threadId,
      })
    )
    const result = await getCorsairInstance()
      .withTenant(session.user.id)
      .gmail.api.messages.send({
        raw,
        threadId: payload.threadId,
      })

    void enqueueCorsairSync({
      tenantId: session.user.id,
      plugin: "gmail",
      reason: "user_action",
      mailbox: "sent",
    }).catch(() => null)

    return NextResponse.json({ message: result })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to send email.",
      },
      { status: 500 }
    )
  }
}
