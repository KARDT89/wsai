import { getCachedMailThreads } from "@/lib/corsair-cache"
import { gmailMailboxes, type GmailMailbox } from "@/lib/corsair/sync"
import { getCurrentSession } from "@/lib/session"

export async function GET(request: Request) {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const mailbox = getMailboxFromRequest(request)
  const threads = await getCachedMailThreads(session.user.id, mailbox)

  return Response.json({ threads })
}

function getMailboxFromRequest(request: Request): GmailMailbox {
  const value = new URL(request.url).searchParams.get("mailbox")

  if (gmailMailboxes.includes(value as GmailMailbox)) {
    return value as GmailMailbox
  }

  return "inbox"
}
