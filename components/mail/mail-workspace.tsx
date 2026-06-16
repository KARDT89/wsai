"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArchiveIcon,
  AttachmentIcon,
  Clock01Icon,
  Delete02Icon,
  InboxIcon,
  Mail01Icon,
  MailSend01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const labels = [
  { name: "Inbox", count: 18, icon: InboxIcon, active: true },
  { name: "Starred", count: 5, icon: StarIcon },
  { name: "Snoozed", count: 3, icon: Clock01Icon },
  { name: "Sent", count: 0, icon: MailSend01Icon },
  { name: "Drafts", count: 2, icon: Mail01Icon },
  { name: "Trash", count: 0, icon: Delete02Icon },
]

const customLabels = [
  { name: "Investors", color: "bg-sky-500" },
  { name: "Customers", color: "bg-emerald-500" },
  { name: "Recruiting", color: "bg-amber-500" },
  { name: "Finance", color: "bg-rose-500" },
]

const threads = [
  {
    id: "maya-investor",
    sender: "Maya Chen",
    email: "maya@northpier.capital",
    subject: "Follow-up on revised terms",
    snippet:
      "Can you confirm whether the updated participation language works before our 11:30 partner call?",
    time: "09:42",
    unread: true,
    starred: true,
    attachment: false,
    labels: ["Investors"],
    messages: [
      {
        author: "Maya Chen",
        meta: "Today, 09:42",
        body:
          "Can you confirm whether the updated participation language works before our 11:30 partner call? If this looks good, I can get the revised memo into our process today.",
      },
      {
        author: "You",
        meta: "Yesterday, 18:05",
        body:
          "Thanks Maya. Send the latest terms over and I will review them first thing in the morning.",
      },
    ],
  },
  {
    id: "northstar-security",
    sender: "Northstar Ops",
    email: "security@northstar.example",
    subject: "Security questionnaire for enterprise trial",
    snippet:
      "Procurement is ready to move once the data retention and SSO answers are complete.",
    time: "10:18",
    unread: true,
    starred: false,
    attachment: true,
    labels: ["Customers"],
    messages: [
      {
        author: "Northstar Ops",
        meta: "Today, 10:18",
        body:
          "Procurement is ready to move once the data retention and SSO answers are complete. We attached the short-form questionnaire and highlighted the remaining questions.",
      },
    ],
  },
  {
    id: "candidate-close",
    sender: "Recruiting",
    email: "talent@wsai.local",
    subject: "Candidate close packet review",
    snippet:
      "Offer details need founder approval before we send the packet this afternoon.",
    time: "13:00",
    unread: false,
    starred: false,
    attachment: true,
    labels: ["Recruiting"],
    messages: [
      {
        author: "Recruiting",
        meta: "Today, 08:35",
        body:
          "The close packet is ready. The comp band is approved, but the equity memo needs your review before we send it.",
      },
    ],
  },
  {
    id: "finance-renewal",
    sender: "Finance",
    email: "finance@wsai.local",
    subject: "Vendor renewal reminder",
    snippet:
      "Renewal window opens next month. No action today unless you want to renegotiate seats.",
    time: "Tue",
    unread: false,
    starred: false,
    attachment: false,
    labels: ["Finance"],
    messages: [
      {
        author: "Finance",
        meta: "Tuesday, 11:21",
        body:
          "Renewal window opens next month. No action today unless you want to renegotiate seats before the annual quote arrives.",
      },
    ],
  },
]

export function MailWorkspace() {
  const [selectedId, setSelectedId] = React.useState(threads[0].id)
  const selectedThread =
    threads.find((thread) => thread.id === selectedId) ?? threads[0]

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const index = threads.findIndex((thread) => thread.id === selectedId)

      if (event.key === "j") {
        event.preventDefault()
        setSelectedId(threads[Math.min(index + 1, threads.length - 1)].id)
      }

      if (event.key === "k") {
        event.preventDefault()
        setSelectedId(threads[Math.max(index - 1, 0)].id)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedId])

  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-cols-1 bg-background md:grid-cols-[220px_minmax(320px,420px)_1fr]">
      <aside className="hidden border-r bg-muted/20 md:block">
        <div className="flex h-full flex-col">
          <div className="p-3">
            <Button className="w-full justify-start gap-2">
              <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-4" />
              Compose
            </Button>
          </div>
          <nav className="space-y-1 px-2">
            {labels.map((label) => (
              <Button
                key={label.name}
                type="button"
                variant={label.active ? "secondary" : "ghost"}
                className="h-8 w-full justify-start gap-2 px-2"
              >
                <HugeiconsIcon icon={label.icon} strokeWidth={2} className="size-4" />
                <span>{label.name}</span>
                {label.count ? (
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {label.count}
                  </span>
                ) : null}
              </Button>
            ))}
          </nav>
          <Separator className="my-3" />
          <div className="px-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Labels
            </p>
            <div className="space-y-2">
              {customLabels.map((label) => (
                <div key={label.name} className="flex items-center gap-2 text-sm">
                  <span className={cn("size-2 rounded-full", label.color)} />
                  <span>{label.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="min-h-0 border-r">
        <div className="flex h-12 items-center justify-between border-b px-3">
          <div>
            <h1 className="text-sm font-semibold">Inbox</h1>
            <p className="text-xs text-muted-foreground">
              {threads.filter((thread) => thread.unread).length} unread
            </p>
          </div>
          <Badge variant="outline" className="font-mono">
            synced via Corsair
          </Badge>
        </div>
        <ScrollArea className="h-[calc(100svh-6.5rem)]">
          <div className="divide-y">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={cn(
                  "grid w-full gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/60",
                  selectedThread.id === thread.id && "bg-muted",
                  thread.unread && "bg-sky-500/5"
                )}
                onClick={() => setSelectedId(thread.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          thread.unread && "font-semibold"
                        )}
                      >
                        {thread.sender}
                      </span>
                      {thread.starred ? (
                        <HugeiconsIcon
                          icon={StarIcon}
                          strokeWidth={2}
                          className="size-3.5 text-amber-500"
                        />
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "mt-1 truncate text-sm",
                        thread.unread ? "font-medium" : "text-muted-foreground"
                      )}
                    >
                      {thread.subject}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {thread.time}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {thread.snippet}
                </p>
                <div className="flex items-center gap-1.5">
                  {thread.labels.map((label) => (
                    <Badge key={label} variant="secondary" className="h-5">
                      {label}
                    </Badge>
                  ))}
                  {thread.attachment ? (
                    <HugeiconsIcon
                      icon={AttachmentIcon}
                      strokeWidth={2}
                      className="ml-auto size-3.5 text-muted-foreground"
                    />
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </section>

      <section className="hidden min-h-0 bg-background lg:flex lg:flex-col">
        <div className="flex h-12 items-center gap-2 border-b px-3">
          <Button variant="ghost" size="icon-sm">
            <HugeiconsIcon icon={ArchiveIcon} strokeWidth={2} />
            <span className="sr-only">Archive</span>
          </Button>
          <Button variant="ghost" size="icon-sm">
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            <span className="sr-only">Delete</span>
          </Button>
          <Button variant="ghost" size="icon-sm">
            <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} />
            <span className="sr-only">Snooze</span>
          </Button>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <p className="truncate text-sm text-muted-foreground">
            AI writes require approval. Direct user actions execute immediately.
          </p>
        </div>

        <ScrollArea className="flex-1">
          <article className="mx-auto max-w-4xl px-5 py-5">
            <header className="mb-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {selectedThread.labels.map((label) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>
              <h2 className="text-2xl font-semibold tracking-normal">
                {selectedThread.subject}
              </h2>
            </header>

            <div className="space-y-3">
              {selectedThread.messages.map((message) => (
                <section
                  key={`${selectedThread.id}-${message.author}-${message.meta}`}
                  className="rounded-lg border bg-card p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{message.author}</p>
                      <p className="text-xs text-muted-foreground">
                        {message.meta} · {selectedThread.email}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm">
                      Reply
                    </Button>
                  </div>
                  <p className="text-sm leading-7 text-card-foreground">
                    {message.body}
                  </p>
                </section>
              ))}
            </div>

            <section className="mt-4 rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Reply</p>
                <Button variant="outline" size="sm">
                  Draft with wsai
                </Button>
              </div>
              <Textarea
                className="min-h-32 resize-none"
                placeholder="Write a reply..."
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={AttachmentIcon} strokeWidth={2} className="size-4" />
                  Attachments
                </div>
                <Button>
                  <HugeiconsIcon icon={MailSend01Icon} strokeWidth={2} className="size-4" />
                  Send
                </Button>
              </div>
            </section>
          </article>
        </ScrollArea>
      </section>
    </div>
  )
}
