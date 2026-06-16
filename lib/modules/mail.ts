import { Mail01Icon, AiMail01Icon } from "@hugeicons/core-free-icons"

import type { WSAIModule } from "./types"

export const mailModule: WSAIModule = {
  id: "mail",
  label: "Mail",
  corsairPlugin: "gmail",

  navItems: [
    { href: "/mail", label: "Mail", icon: Mail01Icon },
  ],

  commandActions: [
    {
      id: "mail.summarize-inbox",
      label: "Summarize unread inbox",
      group: "Mail",
      onSelect: () => ({ type: "ai", prompt: "Summarize my unread inbox" }),
    },
    {
      id: "mail.attention",
      label: "What needs my attention today?",
      group: "Mail",
      onSelect: () => ({ type: "ai", prompt: "What emails need my attention today?" }),
    },
    {
      id: "mail.draft-reply",
      label: "Draft a reply to latest thread",
      group: "Mail",
      onSelect: () => ({ type: "ai", prompt: "Draft a polite reply to the latest email thread" }),
    },
  ],

  async agentContextForItem(itemId: string) {
    try {
      const res = await fetch(`/api/mail/threads/${itemId}`)
      if (!res.ok) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any
      const t = data.thread
      if (!t) return null
      return [
        `Email thread: ${t.subject}`,
        `From: ${t.sender}`,
        `Snippet: ${t.snippet}`,
      ].join("\n")
    } catch {
      return null
    }
  },

  approvalRequired: [
    {
      plugin: "gmail",
      operation: "messages.send",
      describe: (input) => `Send email: ${String(input.subject ?? "untitled")}`,
    },
    {
      plugin: "gmail",
      operation: "drafts.send",
      describe: (input) => `Send draft: ${String(input.subject ?? "untitled")}`,
    },
    {
      plugin: "gmail",
      operation: "threads.delete",
      describe: (input) => `Delete thread: ${String(input.threadId ?? input.id ?? "unknown")}`,
    },
  ],

  dbTables: ["EmailThread", "EmailMessage"],
}

// Register icon override for nav badge (unread count)
export function getMailModule(unreadCount?: number): WSAIModule {
  return {
    ...mailModule,
    navItems: [
      {
        href: "/mail",
        label: "Mail",
        icon: Mail01Icon,
        badge: unreadCount ? String(unreadCount) : undefined,
      },
    ],
  }
}

// Suppress unused import lint warning
void AiMail01Icon
