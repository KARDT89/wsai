import { NextResponse } from "next/server"

import {
  gmailMailboxes,
  syncGmailMailbox,
  type GmailMailbox,
} from "@/lib/corsair/sync"
import { ensureCorsairSetup } from "@/lib/corsair/server"
import { getCurrentSession } from "@/lib/session"

export async function POST(request: Request) {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const mailbox = getMailboxFromRequest(request)

  try {
    await ensureCorsairSetup(session.user.id)
    const result = await syncGmailMailbox(session.user.id, mailbox, "manual")

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to sync mailbox.",
      },
      { status: 500 }
    )
  }
}

function getMailboxFromRequest(request: Request): GmailMailbox {
  const value = new URL(request.url).searchParams.get("mailbox")

  if (gmailMailboxes.includes(value as GmailMailbox)) {
    return value as GmailMailbox
  }

  return "inbox"
}
