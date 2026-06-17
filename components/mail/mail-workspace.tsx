"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArchiveIcon,
  ArrowTurnForwardIcon,
  AttachmentIcon,
  AiChat01Icon,
  Clock01Icon,
  Delete02Icon,
  InboxIcon,
  Mail01Icon,
  MailOpenIcon,
  MailSend01Icon,
  SearchingIcon,
  SpamIcon,
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
import { useAiContext } from "@/lib/ai-context"
import type { CacheMetadata, MailMessage, MailThread } from "@/lib/workspace-types"

type Mailbox = "inbox" | "starred" | "snoozed" | "sent" | "drafts" | "trash"

type ThreadAction =
  | "star"
  | "unstar"
  | "archive"
  | "trash"
  | "untrash"
  | "markRead"
  | "markUnread"
  | "spam"

type ComposeState = {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  threadId?: string
}

type MailThreadsResponse = {
  threads: MailThread[]
  cache?: CacheMetadata
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

export function MailWorkspace() {
  const [selectedId, setSelectedId] = React.useState<string>()
  const [selectedMailbox, setSelectedMailbox] = React.useState<Mailbox>("inbox")
  const [searchQuery, setSearchQuery] = React.useState("")
  const { setAiContext } = useAiContext()
  const [composeOpen, setComposeOpen] = React.useState(false)
  const [composeTitle, setComposeTitle] = React.useState("New message")
  const [compose, setCompose] = React.useState<ComposeState>(emptyCompose)
  const queryClient = useQueryClient()

  const threadsQuery = useQuery({
    queryKey: ["mail", "threads", selectedMailbox],
    queryFn: () => fetchMailThreads(selectedMailbox),
    staleTime: 5_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })

  const threads = React.useMemo(
    () => threadsQuery.data?.threads ?? [],
    [threadsQuery.data]
  )

  const filteredThreads = React.useMemo(() => {
    if (!searchQuery.trim()) return threads
    const q = searchQuery.toLowerCase()
    return threads.filter(
      (t) =>
        t.sender.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.snippet?.toLowerCase().includes(q) ?? false)
    )
  }, [threads, searchQuery])

  const selectedThread =
    filteredThreads.find((t) => t.id === selectedId) ?? filteredThreads[0]

  // Track which threads were auto-marked as read this session
  const markedReadRef = React.useRef<Set<string>>(new Set())

  const sendMutation = useMutation({
    mutationFn: sendMail,
    onSuccess: () => {
      setComposeOpen(false)
      setCompose(emptyCompose)
      setComposeTitle("New message")
      toast.success("Email sent")
      void queryClient.refetchQueries({ queryKey: ["mail", "threads"] })
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
      setComposeTitle("New message")
      toast.success("Draft saved")
      void queryClient.refetchQueries({ queryKey: ["mail", "threads"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save draft")
    },
  })

  const threadActionMutation = useMutation({
    mutationFn: runMailAction,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["mail", "threads", selectedMailbox] })
      const previous = queryClient.getQueryData<MailThreadsResponse>([
        "mail",
        "threads",
        selectedMailbox,
      ])

      queryClient.setQueryData<MailThreadsResponse>(
        ["mail", "threads", selectedMailbox],
        (old) => {
          if (!old) return old
          const oldThreads = old.threads

          if (
            variables.action === "archive" ||
            variables.action === "trash" ||
            variables.action === "untrash" ||
            variables.action === "spam"
          ) {
            return {
              ...old,
              threads: oldThreads.filter((t) => t.corsairId !== variables.threadId),
            }
          }

          if (variables.action === "star") {
            return {
              ...old,
              threads:
                selectedMailbox === "starred"
                  ? oldThreads
                  : oldThreads.map((t) =>
                      t.corsairId === variables.threadId ? { ...t, starred: true } : t
                    ),
            }
          }

          if (variables.action === "unstar") {
            return {
              ...old,
              threads:
                selectedMailbox === "starred"
                  ? oldThreads.filter((t) => t.corsairId !== variables.threadId)
                  : oldThreads.map((t) =>
                      t.corsairId === variables.threadId ? { ...t, starred: false } : t
                    ),
            }
          }

          if (variables.action === "markRead") {
            return {
              ...old,
              threads: oldThreads.map((t) =>
                t.corsairId === variables.threadId ? { ...t, unread: false } : t
              ),
            }
          }

          if (variables.action === "markUnread") {
            return {
              ...old,
              threads: oldThreads.map((t) =>
                t.corsairId === variables.threadId ? { ...t, unread: true } : t
              ),
            }
          }

          return old
        }
      )

      return { previous, mailbox: selectedMailbox }
    },
    onSuccess: (_data, variables) => {
      toast.success(getActionSuccessLabel(variables.action))
      void queryClient.refetchQueries({ queryKey: ["mail", "threads"] })
    },
    onError: (error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["mail", "threads", context.mailbox], context.previous)
      }
      toast.error(error instanceof Error ? error.message : "Unable to update thread")
    },
  })

  const cacheLabel = React.useMemo(
    () => formatCacheStatus(threadsQuery.data?.cache),
    [threadsQuery.data?.cache]
  )

  // Auto-mark thread as read when opened
  React.useEffect(() => {
    if (
      selectedThread?.unread &&
      selectedThread.corsairId &&
      !markedReadRef.current.has(selectedThread.corsairId)
    ) {
      markedReadRef.current.add(selectedThread.corsairId)
      threadActionMutation.mutate({
        threadId: selectedThread.corsairId,
        action: "markRead",
      })
    }
  }, [selectedThread?.corsairId, selectedThread?.unread]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  React.useEffect(() => {
    const searchRef = { current: false }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable

      if (event.key === "/") {
        event.preventDefault()
        document.getElementById("mail-search")?.focus()
        return
      }

      if (isInput) return

      if (threads.length === 0) return
      const index = threads.findIndex((t) => t.id === selectedId)

      if (event.key === "j") {
        event.preventDefault()
        setSelectedId(threads[Math.min(Math.max(index, 0) + 1, threads.length - 1)].id)
      }

      if (event.key === "k") {
        event.preventDefault()
        setSelectedId(threads[Math.max(index - 1, 0)]?.id ?? threads[0].id)
      }

      if (event.key === "e" && selectedThread) {
        event.preventDefault()
        threadActionMutation.mutate({
          threadId: selectedThread.corsairId,
          action: "archive",
        })
      }

      if (event.key === "s" && selectedThread) {
        event.preventDefault()
        threadActionMutation.mutate({
          threadId: selectedThread.corsairId,
          action: selectedThread.starred ? "unstar" : "star",
        })
      }

      if (event.key === "#" && selectedThread) {
        event.preventDefault()
        threadActionMutation.mutate({
          threadId: selectedThread.corsairId,
          action: "trash",
        })
      }

      if (event.key === "u" && selectedThread) {
        event.preventDefault()
        threadActionMutation.mutate({
          threadId: selectedThread.corsairId,
          action: selectedThread.unread ? "markRead" : "markUnread",
        })
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      void searchRef
    }
  }, [selectedId, selectedThread, threads]) // eslint-disable-line react-hooks/exhaustive-deps

  const inboxUnreadCount = React.useMemo(() => {
    if (selectedMailbox !== "inbox") return 0
    return threads.filter((t) => t.unread).length
  }, [threads, selectedMailbox])

  const currentMailboxName =
    mailboxItems.find((item) => item.id === selectedMailbox)?.name ?? "Inbox"

  const handleThreadClick = (thread: MailThread) => {
    setSelectedId(thread.id)
  }

  const addThreadToAiContext = React.useCallback((thread: MailThread) => {
    const contextText = [
      `Subject: ${thread.subject}`,
      `From: ${thread.sender}${thread.email ? ` <${thread.email}>` : ""}`,
      thread.snippet ? `\n${thread.snippet}` : "",
      thread.messages.length > 0
        ? `\nLatest message:\n${thread.messages[thread.messages.length - 1]?.bodyText ?? thread.messages[thread.messages.length - 1]?.body ?? ""}`
        : "",
    ]
      .filter(Boolean)
      .join("\n")
    setAiContext(contextText, `Thread from ${thread.sender}`)
    toast.success("Thread added to AI context")
  }, [setAiContext])

  const openReply = (thread?: typeof selectedThread) => {
    const t = thread ?? selectedThread
    if (!t) return
    setCompose({
      ...emptyCompose,
      to: t.email ?? "",
      subject: t.subject.startsWith("Re:") ? t.subject : `Re: ${t.subject}`,
      threadId: t.corsairId,
    })
    setComposeTitle("Reply")
    setComposeOpen(true)
  }

  const openForward = () => {
    if (!selectedThread) return
    const lastMessage = selectedThread.messages.at(-1)
    const forwardBody = lastMessage
      ? `\n\n---------- Forwarded message ---------\nFrom: ${lastMessage.author}${lastMessage.email ? ` <${lastMessage.email}>` : ""}\n\n${lastMessage.bodyText ?? lastMessage.body ?? ""}`
      : ""
    setCompose({
      ...emptyCompose,
      subject: selectedThread.subject.startsWith("Fwd:")
        ? selectedThread.subject
        : `Fwd: ${selectedThread.subject}`,
      body: forwardBody,
    })
    setComposeTitle("Forward")
    setComposeOpen(true)
  }

  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-cols-1 bg-background md:grid-cols-[220px_minmax(320px,420px)_1fr]">
      {/* Sidebar */}
      <aside className="hidden border-r bg-muted/20 md:block">
        <div className="flex h-full flex-col">
          <div className="p-3">
            <Button
              className="w-full justify-start gap-2"
              onClick={() => {
                setCompose(emptyCompose)
                setComposeTitle("New message")
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
                <span className="flex-1 text-left">{label.name}</span>
                {label.id === "inbox" && inboxUnreadCount > 0 ? (
                  <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                    {inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}
                  </span>
                ) : null}
              </Button>
            ))}
          </nav>
          <Separator className="my-3" />
          <div className="px-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Shortcuts
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Navigate</span>
                <div className="flex gap-1">
                  <kbd className="rounded border px-1 font-mono">j</kbd>
                  <kbd className="rounded border px-1 font-mono">k</kbd>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Archive</span>
                <kbd className="rounded border px-1 font-mono">e</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Star</span>
                <kbd className="rounded border px-1 font-mono">s</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Delete</span>
                <kbd className="rounded border px-1 font-mono">#</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Mark read</span>
                <kbd className="rounded border px-1 font-mono">u</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Search</span>
                <kbd className="rounded border px-1 font-mono">/</kbd>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Thread list */}
      <section className="min-h-0 border-r">
        <div className="flex h-12 items-center gap-2 border-b px-3">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={SearchingIcon}
              strokeWidth={2}
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="mail-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${currentMailboxName.toLowerCase()}…`}
              className="h-7 w-full rounded-md border bg-background pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
            {cacheLabel}
          </Badge>
        </div>

        <div className="flex h-8 items-center border-b px-3">
          <p className="text-xs text-muted-foreground">
            {searchQuery.trim()
              ? `${filteredThreads.length} of ${threads.length} threads`
              : `${threads.length} threads`}
          </p>
        </div>

        <ScrollArea className="h-[calc(100svh-8.5rem)]">
          {threadsQuery.isPending ? (
            <MailState title="Loading Gmail" detail="Reading current Corsair mail data." />
          ) : threadsQuery.isError ? (
            <MailState
              title="Could not load mail"
              detail="The mail API returned an error while reading Corsair mail data."
            />
          ) : filteredThreads.length === 0 ? (
            <MailState
              title={searchQuery.trim() ? "No matching threads" : `No ${currentMailboxName.toLowerCase()} yet`}
              detail={
                searchQuery.trim()
                  ? "Try a different search term."
                  : `No ${currentMailboxName.toLowerCase()} messages are available yet.`
              }
            />
          ) : (
            <div className="divide-y">
              {filteredThreads.map((thread) => (
                <div
                  key={thread.id}
                  className={cn(
                    "group grid w-full cursor-pointer gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                    selectedThread?.id === thread.id && "bg-muted",
                    thread.unread && "bg-sky-500/5"
                  )}
                  onClick={() => handleThreadClick(thread)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          thread.unread ? "bg-sky-500" : "bg-transparent"
                        )}
                      />
                      <span
                        className={cn(
                          "truncate text-sm",
                          thread.unread ? "font-semibold" : "text-muted-foreground"
                        )}
                      >
                        {thread.sender}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {thread.attachment ? (
                        <HugeiconsIcon
                          icon={AttachmentIcon}
                          strokeWidth={2}
                          className="size-3 text-muted-foreground"
                        />
                      ) : null}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {thread.time}
                      </span>
                    </div>
                  </div>

                  <p
                    className={cn(
                      "truncate text-sm",
                      thread.unread ? "font-medium" : "text-muted-foreground"
                    )}
                  >
                    {thread.subject}
                  </p>

                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {thread.snippet}
                  </p>

                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      {thread.labels.slice(0, 2).map((label) => (
                        <Badge key={label} variant="secondary" className="h-4 px-1 text-[10px]">
                          {label}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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

                      <ThreadIconButton
                        label={thread.unread ? "Mark read" : "Mark unread"}
                        disabled={isThreadActionDisabled(selectedMailbox)}
                        onClick={() =>
                          threadActionMutation.mutate({
                            threadId: thread.corsairId,
                            action: thread.unread ? "markRead" : "markUnread",
                          })
                        }
                      >
                        <HugeiconsIcon
                          icon={thread.unread ? MailOpenIcon : Mail01Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                      </ThreadIconButton>

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
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </section>

      {/* Thread detail */}
      <section className="hidden min-h-0 overflow-hidden bg-background lg:flex lg:flex-col">
        {/* Action bar */}
        <div className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Archive (e)"
            disabled={!selectedThread || isThreadActionDisabled(selectedMailbox)}
            onClick={() =>
              selectedThread &&
              threadActionMutation.mutate({
                threadId: selectedThread.corsairId,
                action: "archive",
              })
            }
          >
            <HugeiconsIcon icon={ArchiveIcon} strokeWidth={2} className="size-4" />
            <span className="sr-only">Archive</span>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            title="Trash (#)"
            disabled={!selectedThread || isThreadActionDisabled(selectedMailbox)}
            onClick={() =>
              selectedThread &&
              threadActionMutation.mutate({
                threadId: selectedThread.corsairId,
                action: selectedMailbox === "trash" ? "untrash" : "trash",
              })
            }
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
            <span className="sr-only">{selectedMailbox === "trash" ? "Restore" : "Delete"}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            title="Mark as spam"
            disabled={
              !selectedThread ||
              isThreadActionDisabled(selectedMailbox) ||
              selectedMailbox === "trash"
            }
            onClick={() =>
              selectedThread &&
              threadActionMutation.mutate({
                threadId: selectedThread.corsairId,
                action: "spam",
              })
            }
          >
            <HugeiconsIcon icon={SpamIcon} strokeWidth={2} className="size-4" />
            <span className="sr-only">Spam</span>
          </Button>

          <Separator orientation="vertical" className="mx-1 h-4" />

          <Button
            variant="ghost"
            size="icon-sm"
            title={selectedThread?.starred ? "Unstar (s)" : "Star (s)"}
            disabled={!selectedThread || isThreadActionDisabled(selectedMailbox)}
            onClick={() =>
              selectedThread &&
              threadActionMutation.mutate({
                threadId: selectedThread.corsairId,
                action: selectedThread.starred ? "unstar" : "star",
              })
            }
          >
            <HugeiconsIcon
              icon={StarIcon}
              strokeWidth={2}
              className={cn("size-4", selectedThread?.starred && "fill-amber-400 text-amber-400")}
            />
            <span className="sr-only">{selectedThread?.starred ? "Unstar" : "Star"}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            title={selectedThread?.unread ? "Mark read (u)" : "Mark unread (u)"}
            disabled={!selectedThread || isThreadActionDisabled(selectedMailbox)}
            onClick={() =>
              selectedThread &&
              threadActionMutation.mutate({
                threadId: selectedThread.corsairId,
                action: selectedThread.unread ? "markRead" : "markUnread",
              })
            }
          >
            <HugeiconsIcon
              icon={selectedThread?.unread ? MailOpenIcon : Mail01Icon}
              strokeWidth={2}
              className="size-4"
            />
            <span className="sr-only">
              {selectedThread?.unread ? "Mark read" : "Mark unread"}
            </span>
          </Button>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedThread}
              onClick={() => selectedThread && addThreadToAiContext(selectedThread)}
            >
              <HugeiconsIcon icon={AiChat01Icon} strokeWidth={2} className="size-4" />
              Use as context
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedThread}
              onClick={openForward}
            >
              <HugeiconsIcon icon={ArrowTurnForwardIcon} strokeWidth={2} className="size-4" />
              Forward
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={!selectedThread}
              onClick={() => openReply()}
            >
              Reply
            </Button>
          </div>
        </div>

        {selectedThread ? (
          <ScrollArea className="h-[calc(100svh-6.5rem)]">
            <article className="mx-auto max-w-4xl px-5 py-5">
              <header className="mb-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {selectedThread.unread ? (
                    <Badge variant="secondary" className="gap-1">
                      <span className="size-1.5 rounded-full bg-sky-500" />
                      Unread
                    </Badge>
                  ) : null}
                  {selectedThread.labels.map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </div>
                <h2 className="text-2xl font-semibold tracking-normal">
                  {selectedThread.subject}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedThread.messages.length}{" "}
                  {selectedThread.messages.length === 1 ? "message" : "messages"}
                </p>
              </header>

              <div className="space-y-3">
                {selectedThread.messages.map((message, index) => (
                  <section
                    key={`${selectedThread.id}-${message.id}`}
                    className="overflow-hidden rounded-lg border bg-card"
                  >
                    <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
                          {(message.author[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{message.author}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {message.email ?? selectedThread.email ?? ""} · {message.meta}
                          </p>
                        </div>
                      </div>
                      {index === selectedThread.messages.length - 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openReply(selectedThread)}
                        >
                          Reply
                        </Button>
                      ) : null}
                    </div>
                    <MailMessageBody message={message} />
                  </section>
                ))}
              </div>

            </article>
          </ScrollArea>
        ) : (
          <div className="flex h-[calc(100svh-6.5rem)] items-center justify-center p-6 text-center">
            <div>
              <h2 className="text-lg font-semibold">Select a thread</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Click a thread in the list or use <kbd className="rounded border px-1 font-mono text-xs">j</kbd> / <kbd className="rounded border px-1 font-mono text-xs">k</kbd> to navigate.
              </p>
            </div>
          </div>
        )}
      </section>

      <ComposeDialog
        open={composeOpen}
        title={composeTitle}
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

async function fetchMailThreads(mailbox: Mailbox): Promise<MailThreadsResponse> {
  const response = await fetch(`/api/mail/threads?mailbox=${mailbox}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("Unable to fetch mail threads")
  }

  const payload = (await response.json()) as MailThreadsResponse
  return {
    threads: payload.threads ?? [],
    cache: payload.cache,
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
  action: ThreadAction
  labelId?: string
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
      title={label}
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

function getActionSuccessLabel(action: ThreadAction) {
  if (action === "star") return "Thread starred"
  if (action === "unstar") return "Thread unstarred"
  if (action === "archive") return "Thread archived"
  if (action === "trash") return "Thread moved to trash"
  if (action === "untrash") return "Thread restored"
  if (action === "markRead") return "Marked as read"
  if (action === "markUnread") return "Marked as unread"
  if (action === "spam") return "Marked as spam"
  return "Done"
}

async function getErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string
  } | null

  return payload?.error ?? fallback
}

function formatCacheStatus(cache?: CacheMetadata) {
  if (cache?.status === "running") return "Refreshing..."
  if (cache?.status === "failed") return "Sync issue"
  return formatCacheFreshness(cache?.lastSyncedAt)
}

function formatCacheFreshness(value?: string | null) {
  if (!value) return "Not synced"

  const syncedAt = new Date(value).getTime()
  if (!Number.isFinite(syncedAt)) return "Cached"

  const seconds = Math.max(0, Math.floor((Date.now() - syncedAt) / 1000))
  if (seconds < 15) return "Synced just now"
  if (seconds < 60) return `Synced ${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Synced ${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Synced ${hours}h ago`

  const days = Math.floor(hours / 24)
  return `Synced ${days}d ago`
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
  title,
  value,
  isSending,
  isSavingDraft,
  onOpenChange,
  onChange,
  onSend,
  onSaveDraft,
}: {
  open: boolean
  title: string
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
          <DialogTitle>{title}</DialogTitle>
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
        className="h-(--email-document-height,400px) w-full"
        onLoad={updateHeight}
      />
    </div>
  )
}

function createEmailDocument(html: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px 24px; font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.6; color: #09090b; background: #fff; word-break: break-word; }
  a { color: #2563eb; }
  img { max-width: 100%; height: auto; }
  pre, code { font-family: ui-monospace, monospace; font-size: 13px; white-space: pre-wrap; }
  blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid #e4e4e7; color: #71717a; }
  table { border-collapse: collapse; max-width: 100%; }
</style>
</head>
<body>${html}</body>
</html>`
}
