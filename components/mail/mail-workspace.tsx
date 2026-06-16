"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
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
import type { MailThread } from "@/lib/workspace-types"

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

export function MailWorkspace() {
  const [selectedId, setSelectedId] = React.useState<string>()
  const threadsQuery = useQuery({
    queryKey: ["mail", "threads"],
    queryFn: fetchMailThreads,
  })
  const threads = React.useMemo(() => threadsQuery.data ?? [], [threadsQuery.data])
  const selectedThread =
    threads.find((thread) => thread.id === selectedId) ?? threads[0]

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (threads.length === 0) return
      const index = threads.findIndex((thread) => thread.id === selectedId)

      if (event.key === "j") {
        event.preventDefault()
        setSelectedId(threads[Math.min(Math.max(index, 0) + 1, threads.length - 1)].id)
      }

      if (event.key === "k") {
        event.preventDefault()
        setSelectedId(threads[Math.max(index - 1, 0)]?.id ?? threads[0].id)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedId, threads])

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
          {threadsQuery.isPending ? (
            <MailState title="Loading cached Gmail" detail="Reading Corsair cache rows." />
          ) : threadsQuery.isError ? (
            <MailState
              title="Could not load mail"
              detail="The mail API returned an error while reading Corsair cache."
            />
          ) : threads.length === 0 ? (
            <MailState
              title="No cached Gmail yet"
              detail="Connect Gmail and run Corsair backfill or wait for webhooks to populate corsair_entities."
            />
          ) : (
          <div className="divide-y">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={cn(
                  "grid w-full gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/60",
                  selectedThread?.id === thread.id && "bg-muted",
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
          )}
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

        {selectedThread ? (
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
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <div>
              <h2 className="text-lg font-semibold">Select a thread</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Real Gmail threads will appear here after Corsair cache rows are available.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

async function fetchMailThreads(): Promise<MailThread[]> {
  const response = await fetch("/api/mail/threads")

  if (!response.ok) {
    throw new Error("Unable to fetch mail threads")
  }

  const payload = (await response.json()) as { threads?: MailThread[] }
  return payload.threads ?? []
}

function MailState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-72 items-center justify-center p-6 text-center">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  )
}
