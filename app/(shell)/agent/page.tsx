"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AiChat01Icon,
  ArrowUp01Icon,
  Attachment01Icon,
  BoltIcon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  CommandIcon,
  Delete02Icon,
  Edit02Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/lib/agent-models"
import type { AgentStreamEvent, ModelId, Step } from "@/lib/agent-models"
import { useAiContext } from "@/lib/ai-context"
import type { MailThread } from "@/lib/workspace-types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  steps?: Step[]
}

type AgentSession = {
  id: string
  title: string
  model: ModelId
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

type SessionListItem = {
  id: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
}

const SUGGESTIONS = [
  "What emails need my attention today?",
  "Summarize my unread inbox",
  "Find emails from last week about meetings",
  "What's on my calendar tomorrow?",
  "Draft a reply to the latest email thread",
  "Search for emails with attachments",
]

function ToolSteps({ steps, streaming }: { steps: Step[]; streaming: boolean }) {
  const [expanded, setExpanded] = React.useState(false)
  const hasRunning = steps.some((s) => !s.done)
  const allDone = steps.length > 0 && steps.every((s) => s.done)

  if (steps.length === 0) return null

  if (allDone && !streaming && !expanded) {
    return (
      <button
        type="button"
        className="mb-3 flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] text-primary/70 transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        onClick={() => setExpanded(true)}
      >
        <HugeiconsIcon icon={BoltIcon} strokeWidth={2} className="size-3" />
        {steps.length} operation{steps.length !== 1 ? "s" : ""} · show steps
      </button>
    )
  }

  if (expanded && allDone) {
    return (
      <div className="mb-4 overflow-hidden rounded-xl border border-border/50 bg-muted/30">
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/60">
            <HugeiconsIcon icon={BoltIcon} strokeWidth={2} className="size-3" />
            Workflow trace
          </span>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(false)}
          >
            collapse
          </button>
        </div>
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2.5 px-3 py-1.5">
            <HugeiconsIcon
              icon={CheckmarkCircle01Icon}
              strokeWidth={2}
              className="size-3.5 shrink-0 text-emerald-500"
            />
            <span className="text-[11px] text-muted-foreground">{step.label}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 to-transparent">
      <div className="flex items-center gap-2 border-b border-primary/10 px-3 py-2">
        <div className="size-1.5 animate-pulse rounded-full bg-primary" />
        <span className="text-[11px] font-medium text-primary/80">
          {hasRunning ? "Working…" : "Completed"}
        </span>
      </div>
      <div className="py-1">
        {steps.map((step) => (
          <div
            key={step.id}
            className="flex items-center gap-2.5 px-3 py-1.5 animate-in fade-in slide-in-from-left-2 duration-300"
          >
            {step.done ? (
              <HugeiconsIcon
                icon={CheckmarkCircle01Icon}
                strokeWidth={2}
                className="size-3.5 shrink-0 text-emerald-500"
              />
            ) : (
              <div className="size-3.5 shrink-0 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
            )}
            <span className={cn("text-xs transition-colors", step.done ? "text-muted-foreground" : "text-foreground")}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ThreadAvatar({ sender }: { sender: string }) {
  const initials = sender
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
  const hue = Math.abs(sender.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360)
  return (
    <div
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: `hsl(${hue}, 60%, 50%)` }}
    >
      {initials || "?"}
    </div>
  )
}

export default function AgentPage() {
  const { contextText, contextLabel, setAiContext, clearAiContext } = useAiContext()

  const [sessionList, setSessionList] = React.useState<SessionListItem[]>([])
  const [activeSession, setActiveSession] = React.useState<AgentSession | null>(null)
  const [sessionsLoaded, setSessionsLoaded] = React.useState(false)

  const [model, setModel] = React.useState<ModelId>(DEFAULT_MODEL)
  const [input, setInput] = React.useState("")
  const [streaming, setStreaming] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [threads, setThreads] = React.useState<MailThread[]>([])
  const [threadsLoading, setThreadsLoading] = React.useState(false)

  const msgCounter = React.useRef(0)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const activeSessionIdRef = React.useRef<string | null>(null)

  // Load session list on mount
  React.useEffect(() => {
    void loadSessionList()
  }, [])

  async function loadSessionList() {
    try {
      const res = await fetch("/api/agent/sessions")
      const data = (await res.json()) as { sessions: SessionListItem[] }
      setSessionList(data.sessions ?? [])
    } catch {
      // silent
    } finally {
      setSessionsLoaded(true)
    }
  }

  async function loadSession(id: string) {
    try {
      const res = await fetch(`/api/agent/sessions/${id}`)
      const data = (await res.json()) as { session: AgentSession }
      const s = data.session
      setActiveSession({
        ...s,
        messages: (s.messages as unknown as ChatMessage[]) ?? [],
      })
      activeSessionIdRef.current = s.id
      setModel((s.model as ModelId) ?? DEFAULT_MODEL)
    } catch {
      toast.error("Failed to load conversation")
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await fetch(`/api/agent/sessions/${id}`, { method: "DELETE" })
    setSessionList((prev) => prev.filter((s) => s.id !== id))
    if (activeSessionIdRef.current === id) {
      setActiveSession(null)
      activeSessionIdRef.current = null
    }
  }

  function startNewChat() {
    setActiveSession(null)
    activeSessionIdRef.current = null
    setInput("")
    textareaRef.current?.focus()
  }

  const messages = activeSession?.messages ?? []

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      const viewport = scrollContainerRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      )
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    })
  }, [])

  React.useEffect(() => {
    scrollToBottom()
  }, [messages.length, scrollToBottom])

  async function fetchThreads() {
    if (threads.length > 0) return
    setThreadsLoading(true)
    try {
      const res = await fetch("/api/mail/threads?mailbox=inbox")
      const data = (await res.json()) as { threads: MailThread[] }
      setThreads(data.threads?.slice(0, 20) ?? [])
    } catch {
      // silent
    } finally {
      setThreadsLoading(false)
    }
  }

  function attachThread(thread: MailThread) {
    const lines = [
      `Subject: ${thread.subject}`,
      `From: ${thread.sender}${thread.email ? ` <${thread.email}>` : ""}`,
      `Snippet: ${thread.snippet}`,
    ]
    if (thread.messages.length > 0) {
      lines.push(
        "\nMessages:\n" +
          thread.messages.map((m) => `[${m.author}]: ${m.bodyText ?? m.body}`).join("\n\n")
      )
    }
    setAiContext(lines.join("\n"), thread.subject)
    setPickerOpen(false)
  }

  async function handleSend(overrideInput?: string) {
    const text = (overrideInput ?? input).trim()
    if (!text || streaming) return

    setInput("")
    if (textareaRef.current) textareaRef.current.style.height = "24px"

    const userId = `u-${++msgCounter.current}`
    const assistantId = `a-${++msgCounter.current}`

    const userMsg: ChatMessage = { id: userId, role: "user", content: text }
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", steps: [] }

    let sessionId = activeSessionIdRef.current
    let usedModel = model
    let isNewSession = false

    if (!sessionId) {
      // Create new session in DB
      isNewSession = true
      usedModel = model
      try {
        const res = await fetch("/api/agent/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: text.slice(0, 60),
            model,
            messages: [userMsg, assistantMsg],
          }),
        })
        const data = (await res.json()) as { session: { id: string; title: string; model: string; createdAt: string; updatedAt: string } }
        sessionId = data.session.id
        activeSessionIdRef.current = sessionId
        setActiveSession({
          id: sessionId,
          title: text.slice(0, 60),
          model,
          messages: [userMsg, assistantMsg],
          createdAt: data.session.createdAt,
          updatedAt: data.session.updatedAt,
        })
        setSessionList((prev) => [
          { id: sessionId!, title: text.slice(0, 60), model, createdAt: data.session.createdAt, updatedAt: data.session.updatedAt },
          ...prev,
        ])
      } catch {
        toast.error("Failed to create conversation")
        return
      }
    } else {
      usedModel = activeSession?.model ?? model
      setActiveSession((prev) => {
        if (!prev) return prev
        return { ...prev, messages: [...prev.messages, userMsg, assistantMsg] }
      })
    }

    setStreaming(true)

    // Mutable reference to accumulate messages during streaming
    let currentMessages: ChatMessage[] = isNewSession
      ? [userMsg, assistantMsg]
      : [...(activeSession?.messages ?? []), userMsg, assistantMsg]

    function updateMsg(fn: (m: ChatMessage) => ChatMessage) {
      currentMessages = currentMessages.map((m) => (m.id === assistantId ? fn(m) : m))
      setActiveSession((prev) => {
        if (!prev) return prev
        return { ...prev, messages: currentMessages }
      })
    }

    try {
      const fullPrompt = contextText
        ? `Context:\n${contextText}\n\nUser message:\n${text}`
        : text

      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt, model: usedModel }),
      })

      if (!response.ok || !response.body) {
        const err = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(err?.error ?? "Request failed")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line) as AgentStreamEvent
            if (event.type === "tool_start") {
              updateMsg((m) => ({
                ...m,
                steps: [...(m.steps ?? []), { id: event.id, label: event.label, done: false }],
              }))
            } else if (event.type === "tool_done") {
              updateMsg((m) => ({
                ...m,
                steps: (m.steps ?? []).map((s) => (s.id === event.id ? { ...s, done: true } : s)),
              }))
            } else if (event.type === "text") {
              updateMsg((m) => ({ ...m, content: m.content + event.delta }))
            }
          } catch {
            // skip malformed line
          }
        }
        scrollToBottom()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
      updateMsg((m) => ({ ...m, content: "Something went wrong. Please try again." }))
    } finally {
      setStreaming(false)
      scrollToBottom()
      textareaRef.current?.focus()

      // Persist final messages to DB
      if (sessionId) {
        void fetch(`/api/agent/sessions/${sessionId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: currentMessages }),
        })
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = "auto"
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
  }

  const isEmptyState = messages.length === 0

  return (
    <div className="flex h-[calc(100svh-3.5rem)] min-h-0 bg-background">
      {/* Conversation sidebar */}
      <aside className="hidden min-h-0 w-64 shrink-0 flex-col border-r bg-muted/20 lg:flex">
        <div className="shrink-0 p-3">
          <Button className="w-full justify-start gap-2" variant="outline" onClick={startNewChat}>
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-4" />
            New chat
          </Button>
        </div>

        <Separator />

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-0.5 p-2">
            {!sessionsLoaded ? (
              <div className="flex items-center justify-center py-8">
                <HugeiconsIcon
                  icon={RefreshIcon}
                  strokeWidth={2}
                  className="size-4 animate-spin text-muted-foreground"
                />
              </div>
            ) : sessionList.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                No conversations yet
              </p>
            ) : (
              sessionList.map((s) => {
                const active = activeSession?.id === s.id

                return (
                  <div
                    key={s.id}
                    className={cn(
                      "group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_1.75rem] items-center overflow-hidden rounded-md transition-colors hover:bg-muted",
                      active && "bg-muted font-medium"
                    )}
                  >
                    <button
                      type="button"
                      className="block min-w-0 overflow-hidden truncate rounded-md px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={s.title}
                      onClick={() => void loadSession(s.id)}
                    >
                      {s.title}
                    </button>
                    <button
                      type="button"
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                      onClick={(e) => void deleteSession(s.id, e)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
                      <span className="sr-only">Delete</span>
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>

        <Separator />

        <div className="shrink-0 p-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Model
          </p>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ModelId)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {isEmptyState ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-24">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HugeiconsIcon icon={AiChat01Icon} strokeWidth={1.5} className="size-7" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">wsai agent</h1>
            <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
              Your AI-powered workspace assistant. Ask me to search emails, summarize threads,
              draft replies, or manage your calendar.
            </p>

            <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-xl border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => void handleSend(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={scrollContainerRef} className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
                {messages.map((msg, index) => {
                  const isLast = index === messages.length - 1
                  const isLastStreaming = isLast && streaming
                  const isUser = msg.role === "user"
                  const hasSteps = (msg.steps?.length ?? 0) > 0
                  const hasContent = Boolean(msg.content)
                  const showDots = !isUser && !hasContent && !hasSteps && isLastStreaming
                  const showBubble = isUser || hasContent || showDots

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex items-start gap-3",
                        isUser && "flex-row-reverse"
                      )}
                    >
                      {/* Avatar */}
                      {isUser ? (
                        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-semibold">
                          U
                        </div>
                      ) : (
                        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                          <HugeiconsIcon
                            icon={CommandIcon}
                            strokeWidth={2}
                            className="size-3.5 text-primary"
                          />
                        </div>
                      )}

                      {/* Content column */}
                      <div
                        className={cn(
                          "flex min-w-0 max-w-[80%] flex-col",
                          isUser && "items-end"
                        )}
                      >
                        {/* Tool steps (assistant only) */}
                        {hasSteps ? (
                          <ToolSteps steps={msg.steps!} streaming={isLastStreaming} />
                        ) : null}

                        {/* Message bubble */}
                        {showBubble ? (
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-3 text-sm shadow-sm",
                              isUser
                                ? "rounded-tr-sm bg-linear-to-br from-primary to-primary/80 text-primary-foreground"
                                : "rounded-tl-sm bg-muted/60 text-foreground ring-1 ring-border/50"
                            )}
                          >
                            {showDots ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:0ms]" />
                                <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:150ms]" />
                                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
                              </span>
                            ) : isUser ? (
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            ) : (
                              <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content}
                                </ReactMarkdown>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Thread picker backdrop */}
        {pickerOpen ? (
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
        ) : null}

        {/* Input bar */}
        <div className="relative shrink-0 border-t bg-background/80 backdrop-blur-sm">
          {/* Thread picker popup */}
          {pickerOpen ? (
            <div
              className="fixed bottom-28 left-1/2 z-50 flex max-h-[min(28rem,calc(100svh-9rem))] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border bg-background/95 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
                <span className="text-xs font-semibold">Attach a thread as context</span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {threadsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <HugeiconsIcon
                      icon={RefreshIcon}
                      strokeWidth={2}
                      className="size-4 animate-spin text-muted-foreground"
                    />
                  </div>
                ) : threads.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No threads found
                  </p>
                ) : (
                  threads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                      onClick={() => attachThread(t)}
                    >
                      <ThreadAvatar sender={t.sender} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{t.subject}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{t.snippet}</p>
                      </div>
                      {t.unread ? (
                        <div className="size-1.5 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div className="mx-auto max-w-3xl px-4 py-4">
            {contextLabel ? (
              <div className="mb-2.5 flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                  <HugeiconsIcon
                    icon={Attachment01Icon}
                    strokeWidth={2}
                    className="size-3.5 shrink-0 text-primary"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">
                    {contextLabel}
                  </span>
                  <button
                    type="button"
                    onClick={clearAiContext}
                    className="shrink-0 text-primary/50 transition-colors hover:text-primary"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                    <span className="sr-only">Clear context</span>
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex items-end gap-2 rounded-2xl border bg-background px-3 py-2.5 shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20">
              <button
                type="button"
                title="Attach a thread"
                className={cn(
                  "mb-0.5 shrink-0 rounded-lg p-1.5 transition-colors",
                  pickerOpen
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => {
                  const next = !pickerOpen
                  setPickerOpen(next)
                  if (next) void fetchThreads()
                }}
              >
                <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} className="size-4" />
              </button>
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={
                  streaming
                    ? "Thinking…"
                    : "Ask wsai anything…  (Enter to send, Shift+Enter for newline)"
                }
                disabled={streaming}
                className="max-h-50 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                style={{ height: "24px" }}
              />
              <button
                type="button"
                disabled={!input.trim() || streaming}
                onClick={() => void handleSend()}
                className={cn(
                  "mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl transition-all",
                  input.trim() && !streaming
                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2.5} className="size-4" />
                <span className="sr-only">Send</span>
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                {activeSession
                  ? AVAILABLE_MODELS.find((m) => m.id === activeSession.model)?.label ??
                    activeSession.model
                  : AVAILABLE_MODELS.find((m) => m.id === model)?.label ?? model}
              </span>
              {messages.length > 0 ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={startNewChat}
                >
                  New chat
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
