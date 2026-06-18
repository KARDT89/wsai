import { after, NextResponse } from "next/server"

import { ensureCorsairSetup, getCorsairInstance } from "@/lib/corsair/server"
import { logReliableSyncFailure, requestReliableSync } from "@/lib/corsair/reliable-sync"
import { createRfc822Message, encodeBase64Url } from "@/lib/mail/mime"
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

  if (!payload.to && !payload.subject && !payload.body) {
    return NextResponse.json(
      { error: "Draft needs at least one field." },
      { status: 400 }
    )
  }

  try {
    await ensureCorsairSetup(session.user.id)
    const raw = encodeBase64Url(
      createRfc822Message({
        to: payload.to ?? "",
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject ?? "",
        body: payload.body ?? "",
        threadId: payload.threadId,
      })
    )
    const result = await getCorsairInstance()
      .withTenant(session.user.id)
      .gmail.api.drafts.create({
        draft: {
          message: {
            raw,
            threadId: payload.threadId,
          },
        },
      })

    after(() =>
      requestReliableSync({
        tenantId: session.user.id,
        plugin: "gmail",
        reason: "user_action",
      }).catch(logReliableSyncFailure("mail draft"))
    )

    return NextResponse.json({ draft: result })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save draft.",
      },
      { status: 500 }
    )
  }
}
