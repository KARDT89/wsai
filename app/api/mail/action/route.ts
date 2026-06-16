import { NextResponse } from "next/server"

import { ensureCorsairSetup, getCorsairInstance } from "@/lib/corsair/server"
import { getCurrentSession } from "@/lib/session"

const threadActions = [
  "star",
  "unstar",
  "archive",
  "trash",
  "untrash",
] as const

type ThreadAction = (typeof threadActions)[number]

type ThreadModifyArgs = {
  id: string
  addLabelIds?: string[]
  removeLabelIds?: string[]
}

type GmailThreadApi = {
  threads: {
    modify: (args: ThreadModifyArgs) => Promise<unknown>
    trash: (args: { id: string }) => Promise<unknown>
    untrash: (args: { id: string }) => Promise<unknown>
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = (await request.json()) as {
    threadId?: string
    action?: string
  }

  if (!payload.threadId || !isThreadAction(payload.action)) {
    return NextResponse.json(
      { error: "threadId and a supported action are required." },
      { status: 400 }
    )
  }

  try {
    await ensureCorsairSetup(session.user.id)
    const gmail = getCorsairInstance().withTenant(session.user.id).gmail.api
    const result = await runThreadAction(gmail, payload.threadId, payload.action)

    return NextResponse.json({ thread: result })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update thread.",
      },
      { status: 500 }
    )
  }
}

function isThreadAction(action?: string): action is ThreadAction {
  return threadActions.includes(action as ThreadAction)
}

function runThreadAction(
  gmail: GmailThreadApi,
  threadId: string,
  action: ThreadAction
) {
  if (action === "star") {
    return gmail.threads.modify({ id: threadId, addLabelIds: ["STARRED"] })
  }

  if (action === "unstar") {
    return gmail.threads.modify({ id: threadId, removeLabelIds: ["STARRED"] })
  }

  if (action === "archive") {
    return gmail.threads.modify({ id: threadId, removeLabelIds: ["INBOX"] })
  }

  if (action === "trash") {
    return gmail.threads.trash({ id: threadId })
  }

  return gmail.threads.untrash({ id: threadId })
}
