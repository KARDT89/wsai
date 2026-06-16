"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArchiveIcon,
  AttachmentIcon,
  Clock01Icon,
  Delete02Icon,
  InboxIcon,
  Mail01Icon,
  MailSend01Icon,
  RefreshIcon,
  StarIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { MailMessage, MailThread } from "@/lib/workspace-types"

type Mailbox = "inbox" | "starred" | "snoozed" | "sent" | "drafts" | "trash"

type ComposeState = {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  threadId?: string
}

const mailboxItems: Array<{
  id: Mailbox
  name: string
  icon: typeof InboxIcon
}> = [
  { id: "inbox", name: "Inbox", icon: InboxIcon },
  { id: "starred", name: "Starred", icon: StarIcon },
  { id: "snoozed", name: "Snoozed", icon: Clock01Icon },
  { id: "sent", name: "Sent", icon: MailSend01Icon },
  { id: "drafts", name: "Drafts", icon: Mail01Icon },
  { id: "trash", name: "Trash", icon: Delete02Icon },
]

const customLabels = [
  { name: "Investors", color: "bg-sky-500" },
  { name: "Customers", color: "bg-emerald-500" },
  { name: "Recruiting", color: "bg-amber-500" },
  { name: "Finance", color: "bg-rose-500" },
]

export function MailWorkspace() {
  const [selectedId, setSelectedId] = React.useState<string>()
  const [selectedMailbox, setSelectedMailbox] = React.useState<Mailbox>("inbox")
  const [composeOpen, setComposeOpen] = React.useState(false)
  const [compose, setCompose] = React.useState<ComposeState>(emptyCompose)
  const queryClient = useQueryClient()
  const threadsQuery = useQuery({
    queryKey: ["mail", "threads", selectedMailbox],
    queryFn: () => fetchMailThreads(selectedMailbox),
    staleTime: 30_000,
  })
  const threads = React.useMemo(() => threadsQuery.data ?? [], [threadsQuery.data])
  const selectedThread =
    threads.find((thread) => thread.id === selectedId) ?? threads[0]
  const sendMutation = useMutation({
    mutationFn: sendMail,
    onSuccess: () => {
      setComposeOpen(false)
      setCompose(emptyCompose)
      toast.success("Email sent")
      void queryClient.invalidateQueries({ queryKey: ["mail", "threads"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to send email")
    },
  })
  const draftMutation = useMutation({
    mutationFn: saveDraft,
    onSuccess: () => {
      setComposeOpen(false)
      setCompose(emptyCompose)
      toast.success("Draft saved")
      void queryClient.invalidateQueries({ queryKey: ["mail", "threads"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save draft")
    },
  })
  const threadActionMutation = useMutation({
    mutationFn: runMailAction,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["mail", "threads", selectedMailbox] })
      const previous = queryClient.getQueryData<MailThread[]>(["mail", "threads", selectedMailbox])

      queryClient.setQueryData<MailThread[]>(
        ["mail", "threads", selectedMailbox],
        (old) => {
          if (!old) return old

          if (
            variables.action === "archive" ||
            variables.action === "trash" ||
            variables.action === "untrash"
          ) {
            return old.filter((t) => t.corsairId !== variables.threadId)
          }

          if (variables.action === "star") {
            return selectedMailbox === "starred"
              ? old
              : old.map((t) =>
                  t.corsairId === variables.threadId ? { ...t, starred: true } : t
                )
          }

          if (variables.action === "unstar") {
            return selectedMailbox === "starred"
              ? old.filter((t) => t.corsairId !== variables.threadId)
              : old.map((t) =>
                  t.corsairId === variables.threadId ? { ...t, starred: false } : t
                )
          }

          return old
        }
      )

      return { previous, mailbox: selectedMailbox }
    },
    onSuccess: (_data, variables) => {
      toast.success(getActionSuccessLabel(variables.action))
      void queryClient.invalidateQueries({ queryKey: ["mail", "threads"] })
    },
    onError: (error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["mail", "threads", context.mailbox], context.previous)
      }
      toast.error(error instanceof Error ? error.message : "Unable to update thread")
    },
  })
  const mailboxSyncMutation = useMutation({
    mutationFn: syncMailbox,
    onSuccess: (_data, mailbox) => {
      void queryClient.invalidateQueries({
        queryKey: ["mail", "threads", mailbox],
      })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to sync mailbox")
    },
  })
  const syncSelectedMailbox = mailboxSyncMutation.mutate

  const currentMailboxName =
    mailboxItems.find((item) => item.id === selectedMailbox)?.name ?? "Inbox"

  const syncedMailboxesRef = React.useRef<Set<Mailbox>>(new Set())

  React.useEffect(() => {
    if (!syncedMailboxesRef.current.has(selectedMailbox)) {
      syncedMailboxesRef.current.add(selectedMailbox)
      syncSelectedMailbox(selectedMailbox)
    }
  }, [selectedMailbox, syncSelectedMailbox])

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
            <Button
              className="w-full justify-start gap-2"
              onClick={() => {
                setCompose(emptyCompose)
                setComposeOpen(true)
              }}
            >
              <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-4" />
              Compose
            </Button>
          </div>
          <nav className="space-y-1 px-2">
            {mailboxItems.map((label) => (
              <Button
                key={label.id}
                type="button"
                variant={selectedMailbox === label.id ? "secondary" : "ghost"}
                className="h-8 w-full justify-start gap-2 px-2"
                onClick={() => setSelectedMailbox(label.id)}
              >
                <HugeiconsIcon icon={label.icon} strokeWidth={2} className="size-4" />
                <span>{label.name}</span>
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
            <h1 className="text-sm font-semibold">{currentMailboxName}</h1>
            <p className="text-xs text-muted-foreground">
              {threads.length} threads
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {mailboxSyncMutation.isPending ? "syncing" : "cached"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={mailboxSyncMutation.isPending}
              onClick={() => mailboxSyncMutation.mutate(selectedMailbox)}
            >
              <HugeiconsIcon
                icon={RefreshIcon}
                strokeWidth={2}
                className={cn("size-4", mailboxSyncMutation.isPending && "animate-spin")}
              />
              <span className="sr-only">Refresh mailbox</span>
            </Button>
          </div>
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
              detail={`No ${currentMailboxName.toLowerCase()} messages are cached yet.`}
            />
          ) : (
          <div className="divide-y">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={cn(
                  "group grid w-full gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/60",
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
                      <ThreadIconButton
                        label={thread.starred ? "Unstar" : "Star"}
                        active={thread.starred}
                        disabled={isThreadActionDisabled(selectedMailbox)}
                        onClick={() =>
                          threadActionMutation.mutate({
                            threadId: thread.corsairId,
                            action: thread.starred ? "unstar" : "star",
                          })
                        }
                      >
                        <HugeiconsIcon icon={StarIcon} strokeWidth={2} className="size-3.5" />
                      </ThreadIconButton>
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
                  <div className="ml-auto flex items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                    {selectedMailbox !== "trash" &&
                    selectedMailbox !== "sent" &&
                    selectedMailbox !== "drafts" ? (
                      <ThreadIconButton
                        label="Archive"
                        disabled={isThreadActionDisabled(selectedMailbox)}
                        onClick={() =>
                          threadActionMutation.mutate({
                            threadId: thread.corsairId,
                            action: "archive",
                          })
                        }
                      >
                        <HugeiconsIcon icon={ArchiveIcon} strokeWidth={2} className="size-3.5" />
                      </ThreadIconButton>
                    ) : null}
                    {selectedMailbox === "trash" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={threadActionMutation.isPending}
                        onClick={(event) => {
                          event.stopPropagation()
                          threadActionMutation.mutate({
                            threadId: thread.corsairId,
                            action: "untrash",
                          })
                        }}
                      >
                        Restore
                      </Button>
                    ) : selectedMailbox !== "drafts" ? (
                      <ThreadIconButton
                        label="Trash"
                        disabled={isThreadActionDisabled(selectedMailbox)}
                        onClick={() =>
                          threadActionMutation.mutate({
                            threadId: thread.corsairId,
                            action: "trash",
                          })
                        }
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
                      </ThreadIconButton>
                    ) : null}
                  </div>
                  {thread.attachment ? (
                    <HugeiconsIcon
                      icon={AttachmentIcon}
                      strokeWidth={2}
                      className="size-3.5 text-muted-foreground"
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          )}
        </ScrollArea>
      </section>

      <section className="hidden min-h-0 bg-background lg:flex lg:flex-col">
        <div className="flex h-12 items-center gap-2 border-b px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!selectedThread || isThreadActionDisabled(selectedMailbox)}
            onClick={() =>
              selectedThread &&
              threadActionMutation.mutate({
                threadId: selectedThread.corsairId,
                action: "archive",
              })
            }
          >
            <HugeiconsIcon icon={ArchiveIcon} strokeWidth={2} />
            <span className="sr-only">Archive</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!selectedThread || isThreadActionDisabled(selectedMailbox)}
            onClick={() =>
              selectedThread &&
              threadActionMutation.mutate({
                threadId: selectedThread.corsairId,
                action: "trash",
              })
            }
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            <span className="sr-only">Delete</span>
          </Button>
          <Button variant="ghost" size="icon-sm" disabled>
            <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} />
            <span className="sr-only">Snooze</span>
          </Button>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!selectedThread || isThreadActionDisabled(selectedMailbox)}
            onClick={() =>
              selectedThread &&
              threadActionMutation.mutate({
                threadId: selectedThread.corsairId,
                action: selectedThread.starred ? "unstar" : "star",
              })
            }
          >
            <HugeiconsIcon icon={StarIcon} strokeWidth={2} />
            <span className="sr-only">
              {selectedThread?.starred ? "Unstar" : "Star"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!selectedThread || selectedMailbox === "sent" || selectedMailbox === "drafts"}
            onClick={() =>
              selectedThread &&
              threadActionMutation.mutate({
                threadId: selectedThread.corsairId,
                action: selectedMailbox === "trash" ? "untrash" : "archive",
              })
            }
          >
            {selectedMailbox === "trash" ? "Restore" : "Archive"}
          </Button>
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

            <div className="space-y-4">
              {selectedThread.messages.map((message) => (
                <section
                  key={`${selectedThread.id}-${message.id}`}
                  className="overflow-hidden rounded-lg border bg-card"
                >
                  <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{message.author}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {message.email ?? selectedThread.email ?? ""} · {message.meta}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm">
                      Reply
                    </Button>
                  </div>
                  <MailMessageBody message={message} />
                </section>
              ))}
            </div>

            <section className="mt-4 rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Reply</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCompose({
                      ...emptyCompose,
                      to: selectedThread.email ?? "",
                      subject: selectedThread.subject.startsWith("Re:")
                        ? selectedThread.subject
                        : `Re: ${selectedThread.subject}`,
                      threadId: selectedThread.corsairId,
                    })
                    setComposeOpen(true)
                  }}
                >
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
                <Button
                  onClick={() => {
                    setCompose({
                      ...emptyCompose,
                      to: selectedThread.email ?? "",
                      subject: selectedThread.subject.startsWith("Re:")
                        ? selectedThread.subject
                        : `Re: ${selectedThread.subject}`,
                      threadId: selectedThread.corsairId,
                    })
                    setComposeOpen(true)
                  }}
                >
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
      <ComposeDialog
        open={composeOpen}
        value={compose}
        isSending={sendMutation.isPending}
        isSavingDraft={draftMutation.isPending}
        onOpenChange={setComposeOpen}
        onChange={setCompose}
        onSend={() => sendMutation.mutate(compose)}
        onSaveDraft={() => draftMutation.mutate(compose)}
      />
    </div>
  )
}

async function fetchMailThreads(mailbox: Mailbox): Promise<MailThread[]> {
  const response = await fetch(`/api/mail/threads?mailbox=${mailbox}`)

  if (!response.ok) {
    throw new Error("Unable to fetch mail threads")
  }

  const payload = (await response.json()) as { threads?: MailThread[] }
  return payload.threads ?? []
}

async function syncMailbox(mailbox: Mailbox) {
  const response = await fetch(`/api/mail/sync?mailbox=${mailbox}`, {
    method: "POST",
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Unable to sync mailbox"))
  }
}

async function sendMail(input: ComposeState) {
  const response = await fetch("/api/mail/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Unable to send email"))
  }
}

async function saveDraft(input: ComposeState) {
  const response = await fetch("/api/mail/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Unable to save draft"))
  }
}

async function runMailAction(input: {
  threadId: string
  action: "star" | "unstar" | "archive" | "trash" | "untrash"
}) {
  const response = await fetch("/api/mail/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Unable to update thread"))
  }
}

function ThreadIconButton({
  label,
  active,
  disabled,
  children,
  onClick,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        active && "text-amber-500 hover:text-amber-500"
      )}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}

function isThreadActionDisabled(mailbox: Mailbox) {
  return mailbox === "drafts"
}

function getActionSuccessLabel(action: "star" | "unstar" | "archive" | "trash" | "untrash") {
  if (action === "star") return "Thread starred"
  if (action === "unstar") return "Thread unstarred"
  if (action === "archive") return "Thread archived"
  if (action === "trash") return "Thread moved to trash"
  return "Thread restored"
}

async function getErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string
  } | null

  return payload?.error ?? fallback
}

const emptyCompose: ComposeState = {
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
}

function ComposeDialog({
  open,
  value,
  isSending,
  isSavingDraft,
  onOpenChange,
  onChange,
  onSend,
  onSaveDraft,
}: {
  open: boolean
  value: ComposeState
  isSending: boolean
  isSavingDraft: boolean
  onOpenChange: (open: boolean) => void
  onChange: (value: ComposeState) => void
  onSend: () => void
  onSaveDraft: () => void
}) {
  const disabled = isSending || isSavingDraft

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compose email</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 gap-3 overflow-y-auto pr-1">
          <div className="grid gap-1.5">
            <Label htmlFor="compose-to">To</Label>
            <Input
              id="compose-to"
              value={value.to}
              onChange={(event) => onChange({ ...value, to: event.target.value })}
              placeholder="person@example.com"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="compose-cc">Cc</Label>
              <Input
                id="compose-cc"
                value={value.cc}
                onChange={(event) => onChange({ ...value, cc: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="compose-bcc">Bcc</Label>
              <Input
                id="compose-bcc"
                value={value.bcc}
                onChange={(event) =>
                  onChange({ ...value, bcc: event.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="compose-subject">Subject</Label>
            <Input
              id="compose-subject"
              value={value.subject}
              onChange={(event) =>
                onChange({ ...value, subject: event.target.value })
              }
              placeholder="Subject"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="compose-body">Message</Label>
            <Textarea
              id="compose-body"
              value={value.body}
              onChange={(event) => onChange({ ...value, body: event.target.value })}
              className="min-h-64 resize-none overflow-y-auto"
              placeholder="Write your email..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={onSaveDraft}
          >
            {isSavingDraft ? "Saving..." : "Save draft"}
          </Button>
          <Button type="button" disabled={disabled} onClick={onSend}>
            <HugeiconsIcon icon={MailSend01Icon} strokeWidth={2} className="size-4" />
            {isSending ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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

function MailMessageBody({ message }: { message: MailMessage }) {
  if (message.bodyHtml) {
    return <EmailHtmlFrame html={message.bodyHtml} />
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-5">
      <pre className="whitespace-pre-wrap wrap-break-word font-sans text-sm leading-7 text-card-foreground">
        {message.bodyText ?? message.body}
      </pre>
    </div>
  )
}

function EmailHtmlFrame({ html }: { html: string }) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const srcDoc = React.useMemo(() => createEmailDocument(html), [html])

  const updateHeight = React.useCallback(() => {
    const documentElement =
      iframeRef.current?.contentDocument?.documentElement ??
      iframeRef.current?.contentWindow?.document.documentElement

    if (!documentElement) return

    iframeRef.current?.style.setProperty(
      "--email-document-height",
      `${documentElement.scrollHeight}px`
    )
  }, [])

  return (
    <div className="bg-white">
      <iframe
        ref={iframeRef}
        title="Email body"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
        className="block h-[min(760px,max(420px,var(--email-document-height,560px)))] w-full border-0 bg-white"
        onLoad={updateHeight}
      />
    </div>
  )
}

function createEmailDocument(html: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base target="_blank" />
    <style>
      :root { color-scheme: light; }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #202124;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 14px;
        line-height: 1.55;
        min-width: 0;
      }
      body {
        overflow-wrap: anywhere;
        overflow-x: auto;
        overflow-y: auto;
      }
      .wsai-email-root {
        box-sizing: border-box;
        width: 100%;
        max-width: 820px;
        margin: 0 auto;
        padding: 24px;
        overflow-x: auto;
      }
      img {
        max-width: 100%;
        height: auto;
      }
      table {
        max-width: 100%;
        border-collapse: collapse;
      }
      table[width] { width: auto; }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      a {
        color: #1a73e8;
      }
    </style>
  </head>
  <body>
    <div class="wsai-email-root">${html}</div>
  </body>
</html>`
}
