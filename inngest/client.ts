import { Inngest } from "inngest"

export const inngest = new Inngest({
  id: "wsai",
})

type SyncPlugin = "gmail" | "googlecalendar"

/**
 * Fire-and-forget sync trigger. Never throws — Inngest being unavailable
 * (e.g. dev server not running) must not fail the action that called it.
 */
export async function triggerSync(tenantId: string, plugin: SyncPlugin, reason: string) {
  const eventName =
    plugin === "gmail"
      ? "corsair/gmail.sync.requested"
      : "corsair/calendar.sync.requested"
  try {
    await inngest.send({ name: eventName, data: { tenantId, reason } })
  } catch {
    // Inngest unavailable — sync will be triggered on next user action or webhook
  }
}
