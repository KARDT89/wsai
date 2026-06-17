import { after, NextResponse } from "next/server"

import { ensureCorsairSetup, getCorsairInstance } from "@/lib/corsair/server"
import { syncCorsairPlugin } from "@/lib/corsair/sync"
import { getCurrentSession } from "@/lib/session"

const threadActions = [
  "star",
  "unstar",
  "archive",
  "trash",
  "untrash",
  "markRead",
  "markUnread",
  "spam",
  "label",
  "unlabel",
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
    labelId?: string
  }

  if (!payload.threadId || !isThreadAction(payload.action)) {
    return NextResponse.json(
      { error: "threadId and a supported action are required." },
      { status: 400 }
    )
  }

  if ((payload.action === "label" || payload.action === "unlabel") && !payload.labelId) {
    return NextResponse.json(
      { error: "labelId is required for label/unlabel actions." },
      { status: 400 }
    )
  }

  try {
    await ensureCorsairSetup(session.user.id)
    const gmail = getCorsairInstance().withTenant(session.user.id).gmail.api
    const result = await runThreadAction(gmail, payload.threadId, payload.action, payload.labelId)
    after(() => syncCorsairPlugin(session.user.id, "gmail", "user_action"))

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

function targetMailboxForAction(action: ThreadAction) {
  if (action === "trash") return "trash"
  if (action === "untrash") return "inbox"
  if (action === "star" || action === "unstar") return "starred"
  if (action === "archive" || action === "spam") return "inbox"
  return "inbox"
}

function isThreadAction(action?: string): action is ThreadAction {
  return threadActions.includes(action as ThreadAction)
}

function runThreadAction(
  gmail: GmailThreadApi,
  threadId: string,
  action: ThreadAction,
  labelId?: string
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

  if (action === "untrash") {
    return gmail.threads.untrash({ id: threadId })
  }

  if (action === "markRead") {
    return gmail.threads.modify({ id: threadId, removeLabelIds: ["UNREAD"] })
  }

  if (action === "markUnread") {
    return gmail.threads.modify({ id: threadId, addLabelIds: ["UNREAD"] })
  }

  if (action === "spam") {
    return gmail.threads.modify({ id: threadId, addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] })
  }

  if (action === "label" && labelId) {
    return gmail.threads.modify({ id: threadId, addLabelIds: [labelId] })
  }

  if (action === "unlabel" && labelId) {
    return gmail.threads.modify({ id: threadId, removeLabelIds: [labelId] })
  }

  return gmail.threads.untrash({ id: threadId })
}
