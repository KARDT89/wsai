import { getCachedCalendarEvents } from "@/lib/corsair-cache"
import { getCurrentSession } from "@/lib/session"

export async function GET() {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const events = await getCachedCalendarEvents(session.user.id)

  return Response.json({ events })
}
