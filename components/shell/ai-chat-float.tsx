"use client"

import Link from "next/link"
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
  ExternalLinkIcon,
  MinusSignIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import type { AgentStreamEvent, Step } from "@/lib/agent-models"
import { useAiContext } from "@/lib/ai-context"
import type { MailThread } from "@/lib/workspace-types"
import { cn } from "@/lib/utils"

// ─── Resize hook ─────────────────────────────────────────────────────────────

const MIN_W = 340
const MAX_W = 780
const MIN_H = 320
const MAX_H = 900
const DEFAULT_W = 420
const DEFAULT_H = 560

function useResizable(defaultW: number, defaultH: number) {
  const [size, setSize] = React.useState({ w: defaultW, h: defaultH })
  const ref = React.useRef<{
    edge: "left" | "top" | "corner"
    sx: number; sy: number; sw: number; sh: number
  } | null>(null)

  const startResize = React.useCallback(
    (edge: "left" | "top" | "corner") => (e: React.MouseEvent) => {
      e.preventDefault()
      ref.current = { edge, sx: e.clientX, sy: e.clientY, sw: size.w, sh: size.h }

      function onMove(ev: MouseEvent) {
        if (!ref.current) return
        const { edge, sx, sy, sw, sh } = ref.current
        const dx = sx - ev.clientX
        const dy = sy - ev.clientY
        setSize({
          w: edge !== "top" ? Math.max(MIN_W, Math.min(MAX_W, sw + dx)) : sw,
          h: edge !== "left" ? Math.max(MIN_H, Math.min(MAX_H, sh + dy)) : sh,
        })
      }
      function onUp() {
        ref.current = null
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
      }
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [size]
  )

  return { size, startResize }
}

// ─── Message types ─────────────────────────────────────────────────────────

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  steps?: Step[]
}

// ─── Thread avatar ────────────────────────────────────────────────────────

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

// ─── Tool step card ────────────────────────────────────────────────────────

function ToolSteps({ steps, streaming }: { steps: Step[]; streaming: boolean }) {
  const [expanded, setExpanded] = React.useState(false)
  const hasRunning = steps.some((s) => !s.done)
  const allDone = steps.length > 0 && steps.every((s) => s.done)

  if (steps.length === 0) return null

  // When text is streaming or done, collapse to a summary badge
  if (allDone && !streaming && !expanded) {
    return (
      <button
        type="button"
        className="mb-2.5 flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] text-primary/70 transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        onClick={() => setExpanded(true)}
        title="Show workflow steps"
      >
        <HugeiconsIcon icon={BoltIcon} strokeWidth={2} className="size-3" />
        {steps.length} operation{steps.length !== 1 ? "s" : ""} completed
        <span className="opacity-50">·</span>
        <span className="opacity-70">show steps</span>
      </button>
    )
  }

  if (expanded && allDone) {
    return (
      <div className="mb-3 overflow-hidden rounded-xl border border-border/50 bg-muted/30">
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
            <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={2} className="size-3.5 shrink-0 text-emerald-500" />
            <span className="text-[11px] text-muted-foreground">{step.label}</span>
          </div>
        ))}
      </div>
    )
  }

  // Active workflow steps
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 to-transparent">
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
            className={cn(
              "flex items-center gap-2.5 px-3 py-1.5 transition-all",
              "animate-in fade-in slide-in-from-left-2 duration-300"
            )}
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
            <span
              className={cn(
                "text-[11px] transition-colors",
                step.done ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

type Props = {
  open: boolean
  onClose: () => void
}

export function AiChatFloat({ open, onClose }: Props) {
  const { contextText, contextLabel, setAiContext, clearAiContext } = useAiContext()
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState("")
  const [streaming, setStreaming] = React.useState(false)
  const [minimized, setMinimized] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [threads, setThreads] = React.useState<MailThread[]>([])
  const [threadsLoading, setThreadsLoading] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const msgCounter = React.useRef(0)
  const { size, startResize } = useResizable(DEFAULT_W, DEFAULT_H)

  React.useEffect(() => {
    if (open) requestAnimationFrame(() => setMounted(true))
    else requestAnimationFrame(() => setMounted(false))
  }, [open])

  const scrollToBottom = React.useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 40)
  }, [])

  React.useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  React.useEffect(() => {
    if (open && !minimized) setTimeout(() => textareaRef.current?.focus(), 120)
  }, [open, minimized])

  // wsai:prompt event from Command+K
  React.useEffect(() => {
    function onPromptEvent(e: Event) {
      const { prompt } = (e as CustomEvent<{ prompt: string }>).detail
      if (prompt) {
        setMinimized(false)
        void handleSend(prompt)
      }
    }
    window.addEventListener("wsai:prompt", onPromptEvent)
    return () => window.removeEventListener("wsai:prompt", onPromptEvent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, contextText])

  async function fetchThreads() {
    if (threads.length > 0) return
    setThreadsLoading(true)
    try {
      const res = await fetch("/api/mail/threads?mailbox=inbox")
      const data = (await res.json()) as { threads: MailThread[] }
      setThreads(data.threads?.slice(0, 20) ?? [])
    } catch { /* silent */ }
    finally { setThreadsLoading(false) }
  }

  function attachThread(thread: MailThread) {
    const lines = [
      `Subject: ${thread.subject}`,
      `From: ${thread.sender}${thread.email ? ` <${thread.email}>` : ""}`,
      `Snippet: ${thread.snippet}`,
    ]
    if (thread.messages.length > 0) {
      lines.push("\nMessages:\n" + thread.messages.map((m) => `[${m.author}]: ${m.bodyText ?? m.body}`).join("\n\n"))
    }
    setAiContext(lines.join("\n"), thread.subject)
    setPickerOpen(false)
  }

  async function handleSend(overrideInput?: string) {
    const text = (overrideInput ?? input).trim()
    if (!text || streaming) return

    setInput("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"

    const userId = `u-${++msgCounter.current}`
    const assistantId = `a-${++msgCounter.current}`

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", steps: [] },
    ])
    setStreaming(true)

    try {
      const fullPrompt = contextText
        ? `Context:\n${contextText}\n\nUser message:\n${text}`
        : text

      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt }),
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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, steps: [...(m.steps ?? []), { id: event.id, label: event.label, done: false }] }
                    : m
                )
              )
            } else if (event.type === "tool_done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, steps: (m.steps ?? []).map((s) => s.id === event.id ? { ...s, done: true } : s) }
                    : m
                )
              )
            } else if (event.type === "text") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + event.delta } : m
                )
              )
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "Something went wrong. Please try again." } : m
        )
      )
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

  function handleTextInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = "auto"
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
  }

  if (!open) return null

  const panelH = minimized ? 52 : size.h
  const pickerBottom = panelH + 24 + 10

  return (
    <>
      {pickerOpen ? <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} /> : null}

      {/* Thread picker */}
      {pickerOpen && !minimized ? (
        <div
          className="fixed right-6 z-51 overflow-hidden rounded-2xl border bg-background/95 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10"
          style={{ bottom: pickerBottom, width: Math.min(size.w - 16, 360) }}
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-xs font-semibold">Attach a thread</span>
            <button type="button" onClick={() => setPickerOpen(false)} className="text-muted-foreground hover:text-foreground">
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

      {/* Floating panel */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl ring-1 ring-black/5 dark:ring-white/10",
          "transition-[opacity,transform] duration-200",
          mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        )}
        style={{ width: size.w, height: panelH }}
      >
        {/* Resize handles */}
        <div className="absolute bottom-2 left-0 top-14 w-1.5 cursor-ew-resize" onMouseDown={startResize("left")}>
          <div className="mx-auto h-full w-px rounded-full bg-primary/0 transition-colors hover:bg-primary/30" />
        </div>
        {!minimized ? (
          <>
            <div className="absolute left-2 right-2 top-0 h-1.5 cursor-ns-resize" onMouseDown={startResize("top")} />
            <div className="absolute left-0 top-0 z-10 size-5 cursor-nwse-resize" onMouseDown={startResize("corner")} />
          </>
        ) : null}

        {/* Header */}
        <div className="relative flex h-13 shrink-0 items-center gap-2.5 overflow-hidden border-b px-4">
          {/* Gradient backdrop */}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-primary/8 via-primary/3 to-transparent" />
          <div className="relative flex size-7 shrink-0 items-center justify-center">
            <div className={cn("absolute inset-0 rounded-full bg-primary/20", streaming && "animate-pulse")} />
            <div className="relative flex size-7 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
              <HugeiconsIcon icon={AiChat01Icon} strokeWidth={1.5} className="size-3.5 text-primary" />
            </div>
          </div>
          <div className="relative min-w-0 flex-1">
            <p className="text-sm font-semibold">wsai</p>
            {!minimized && streaming ? (
              <p className="text-[10px] text-primary animate-pulse">Thinking…</p>
            ) : !minimized && messages.length > 0 ? (
              <p className="text-[10px] text-muted-foreground">{messages.length} message{messages.length !== 1 ? "s" : ""}</p>
            ) : null}
          </div>
          <div className="relative flex items-center gap-0.5">
            <Link href="/agent" onClick={onClose} title="Open full agent"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <HugeiconsIcon icon={ExternalLinkIcon} strokeWidth={2} className="size-3.5" />
            </Link>
            <button type="button" title={minimized ? "Expand" : "Minimize"}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setMinimized((v) => !v)}>
              <HugeiconsIcon icon={minimized ? AiChat01Icon : MinusSignIcon} strokeWidth={2} className="size-3.5" />
            </button>
            <button type="button" title="Close"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={onClose}>
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
            </button>
          </div>
        </div>

        {minimized ? null : (
          <>
            {/* Context chip */}
            {contextLabel ? (
              <div className="flex shrink-0 items-center gap-2 border-b bg-primary/5 px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1.5">
                  <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} className="size-3 shrink-0 text-primary" />
                  <span className="truncate text-[11px] font-medium text-primary">{contextLabel}</span>
                  <button type="button" onClick={clearAiContext} className="ml-auto shrink-0 text-primary/60 hover:text-primary">
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                  </button>
                </div>
              </div>
            ) : null}

            {/* Messages */}
            <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
              {messages.length === 0 ? (
                <div className="flex flex-col gap-4 px-4 py-6">
                  <div className="flex flex-col items-center gap-3 py-2 text-center">
                    <div className="relative">
                      <div className="absolute -inset-3 animate-pulse rounded-full bg-primary/10" />
                      <div className="relative flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                        <HugeiconsIcon icon={CommandIcon} strokeWidth={1.5} className="size-6 text-primary" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">How can I help?</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Search, summarize, draft replies, manage your calendar.</p>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    {[
                      "What needs my attention today?",
                      "Summarize my unread inbox",
                      "Draft a polite reply",
                      "What's on my calendar this week?",
                    ].map((s) => (
                      <button key={s} type="button"
                        className="group flex items-center gap-3 rounded-xl border bg-linear-to-r from-muted/30 to-transparent px-3 py-2.5 text-left text-xs text-muted-foreground transition-all hover:border-primary/30 hover:from-primary/5 hover:text-foreground"
                        onClick={() => void handleSend(s)}>
                        <span className="size-1 shrink-0 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-primary/50" />
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4 px-4 py-4">
                  {messages.map((msg, index) => (
                    <div key={msg.id} className={cn("flex gap-2.5", msg.role === "user" && "flex-row-reverse")}>
                      {/* Avatar */}
                      {msg.role === "assistant" ? (
                        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                          <HugeiconsIcon icon={CommandIcon} strokeWidth={2} className="size-3 text-primary" />
                        </div>
                      ) : (
                        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold ring-1 ring-primary/30">
                          U
                        </div>
                      )}

                      {/* Content */}
                      <div className={cn("flex min-w-0 flex-1 flex-col", msg.role === "user" && "items-end")}>
                        {/* Tool steps (only for assistant) */}
                        {msg.role === "assistant" && msg.steps && msg.steps.length > 0 ? (
                          <ToolSteps steps={msg.steps} streaming={streaming && index === messages.length - 1} />
                        ) : null}

                        {/* Bubble */}
                        {msg.role === "assistant" && msg.content === "" && streaming && index === messages.length - 1 && (!msg.steps || msg.steps.length === 0) ? (
                          // Initial thinking dots (before any tool calls or text)
                          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2.5 text-sm ring-1 ring-border/50">
                            <span className="inline-flex items-center gap-1.5 py-0.5">
                              <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:0ms]" />
                              <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:150ms]" />
                              <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:300ms]" />
                            </span>
                          </div>
                        ) : msg.content ? (
                          <div className={cn(
                            "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                            msg.role === "user"
                              ? "rounded-tr-sm bg-linear-to-br from-primary to-primary/80 text-primary-foreground"
                              : "rounded-tl-sm bg-muted/60 text-foreground ring-1 ring-border/50"
                          )}>
                            {msg.role === "assistant" ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:leading-relaxed prose-code:rounded prose-code:bg-black/10 prose-code:px-1 prose-code:py-0.5 prose-code:text-xs dark:prose-code:bg-white/10">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  <div ref={scrollRef} />
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="shrink-0 border-t bg-background/80 px-3 pb-3 pt-2.5 backdrop-blur-sm">
              <div className={cn(
                "flex items-end gap-2 rounded-xl border bg-muted/30 px-3 py-2 transition-all",
                "focus-within:border-primary/40 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/20"
              )}>
                <button
                  type="button"
                  title="Attach a thread"
                  className={cn(
                    "mb-0.5 shrink-0 rounded-lg p-1 transition-colors",
                    pickerOpen ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  onClick={() => { const next = !pickerOpen; setPickerOpen(next); if (next) void fetchThreads() }}
                >
                  <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} className="size-4" />
                </button>
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={handleTextInput}
                  onKeyDown={handleKeyDown}
                  placeholder={streaming ? "Working…" : "Ask wsai anything…"}
                  disabled={streaming}
                  className="min-h-5.5 max-h-36 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
                  style={{ height: "22px" }}
                />
                <button
                  type="button"
                  disabled={!input.trim() || streaming}
                  onClick={() => void handleSend()}
                  className={cn(
                    "mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg transition-all",
                    input.trim() && !streaming
                      ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2.5} className="size-3.5" />
                  <span className="sr-only">Send</span>
                </button>
              </div>
              {messages.length > 0 ? (
                <div className="mt-1.5 flex justify-end">
                  <button type="button"
                    className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setMessages([])}>
                    <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-2.5" />
                    New conversation
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  )
}
