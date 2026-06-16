"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AiChat01Icon,
  ArrowUp01Icon,
  Attachment01Icon,
  Cancel01Icon,
  CommandIcon,
  Delete02Icon,
  Edit02Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/lib/agent-models"
import type { ModelId } from "@/lib/agent-models"
import { useAiContext } from "@/lib/ai-context"
import type { MailThread } from "@/lib/workspace-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

type Conversation = {
  id: string
  title: string
  model: ModelId
  messages: ChatMessage[]
  createdAt: string
}

const STORAGE_KEY = "wsai-agent-conversations"
const MAX_CONVERSATIONS = 30

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Conversation[]) : []
  } catch {
    return []
  }
}

function saveConversations(convs: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs.slice(0, MAX_CONVERSATIONS)))
  } catch {
    // storage full
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const SUGGESTIONS = [
  "What emails need my attention today?",
  "Summarize my unread inbox",
  "Find emails from last week about meetings",
  "What's on my calendar tomorrow?",
  "Draft a reply to the latest email thread",
  "Search for emails with attachments",
]

function ThreadAvatar({ sender }: { sender: string }) {
  const initials = sender.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
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
  const [conversations, setConversations] = React.useState<Conversation[]>([])
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [model, setModel] = React.useState<ModelId>(DEFAULT_MODEL)
  const [input, setInput] = React.useState("")
  const [streaming, setStreaming] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [threads, setThreads] = React.useState<MailThread[]>([])
  const [threadsLoading, setThreadsLoading] = React.useState(false)
  const msgCounter = React.useRef(0)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const activeIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    setConversations(loadConversations())
  }, [])

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null
  const messages = activeConversation?.messages ?? []

  const scrollToBottom = React.useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }, 50)
  }, [])

  React.useEffect(() => {
    scrollToBottom()
  }, [messages.length, scrollToBottom])

  function startNewChat() {
    setActiveId(null)
    activeIdRef.current = null
    setInput("")
    textareaRef.current?.focus()
  }

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

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== id)
      saveConversations(updated)
      return updated
    })
    if (activeId === id) {
      setActiveId(null)
      activeIdRef.current = null
    }
  }

  async function handleSend(overrideInput?: string) {
    const text = (overrideInput ?? input).trim()
    if (!text || streaming) return

    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px"
    }

    const userId = `u-${++msgCounter.current}`
    const assistantId = `a-${++msgCounter.current}`

    const userMsg: ChatMessage = { id: userId, role: "user", content: text }
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "" }

    // determine or create conversation
    let conversationId = activeIdRef.current
    let usedModel = model

    if (!conversationId) {
      conversationId = makeId()
      activeIdRef.current = conversationId
      setActiveId(conversationId)

      const newConv: Conversation = {
        id: conversationId,
        title: text.slice(0, 60),
        model,
        messages: [userMsg, assistantMsg],
        createdAt: new Date().toISOString(),
      }
      setConversations((prev) => {
        const updated = [newConv, ...prev]
        saveConversations(updated)
        return updated
      })
    } else {
      usedModel = activeConversation?.model ?? model
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === conversationId
            ? { ...c, messages: [...c.messages, userMsg, assistantMsg] }
            : c
        )
        saveConversations(updated)
        return updated
      })
    }

    setStreaming(true)

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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + chunk } : m
                  ),
                }
              : c
          )
          saveConversations(updated)
          return updated
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: "Something went wrong. Please try again." }
                    : m
                ),
              }
            : c
        )
        saveConversations(updated)
        return updated
      })
    } finally {
      setStreaming(false)
      scrollToBottom()
      textareaRef.current?.focus()
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
    <div className="flex h-[calc(100svh-3.5rem)] bg-background">
      {/* Conversation sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/20 lg:flex">
        <div className="p-3">
          <Button className="w-full justify-start gap-2" variant="outline" onClick={startNewChat}>
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-4" />
            New chat
          </Button>
        </div>

        <Separator />

        <ScrollArea className="flex-1">
          <div className="space-y-0.5 p-2">
            {conversations.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                No conversations yet
              </p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted",
                    activeId === conv.id && "bg-muted font-medium"
                  )}
                  onClick={() => {
                    setActiveId(conv.id)
                    activeIdRef.current = conv.id
                  }}
                >
                  <span className="flex-1 truncate">{conv.title}</span>
                  <button
                    type="button"
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-50 hover:opacity-100!"
                    onClick={(e) => deleteConversation(conv.id, e)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
                    <span className="sr-only">Delete</span>
                  </button>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        <Separator />

        <div className="p-3">
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
              Your AI-powered workspace assistant. Ask me to search emails, summarize threads, draft replies, or manage your calendar.
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
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
              {messages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={cn("flex gap-3", msg.role === "user" && "justify-end")}
                >
                  {msg.role === "assistant" ? (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                      <HugeiconsIcon icon={CommandIcon} strokeWidth={2} className="size-3.5" />
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {msg.content === "" && streaming && index === messages.length - 1 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
                      </span>
                    ) : msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>

                  {msg.role === "user" ? (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold ring-1 ring-primary/30">
                      U
                    </div>
                  ) : null}
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
        )}

        {/* Thread picker backdrop */}
        {pickerOpen ? (
          <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
        ) : null}

        {/* Input bar */}
        <div className="relative shrink-0 border-t bg-background/80 backdrop-blur-sm">
          {/* Thread picker popup */}
          {pickerOpen ? (
            <div className="absolute bottom-full left-1/2 z-20 mb-2 w-96 -translate-x-1/2 overflow-hidden rounded-2xl border bg-background/95 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <span className="text-xs font-semibold">Attach a thread as context</span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {threadsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : threads.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">No threads found</p>
                ) : (
                  threads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                      onClick={() => attachThread(t)}
                    >
                      <ThreadAvatar sender={t.sender} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{t.subject}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{t.snippet}</p>
                      </div>
                      {t.unread ? <div className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
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
                  <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">{contextLabel}</span>
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
                {activeConversation
                  ? AVAILABLE_MODELS.find((m) => m.id === activeConversation.model)?.label ??
                    activeConversation.model
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
