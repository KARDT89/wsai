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
  Cancel01Icon,
  CommandIcon,
  ExternalLinkIcon,
  MinusSignIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { useAiContext } from "@/lib/ai-context"
import type { MailThread } from "@/lib/workspace-types"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

// ─── Resize hook ─────────────────────────────────────────────────────────────

const MIN_W = 340
const MAX_W = 780
const MIN_H = 320
const MAX_H = 900
const DEFAULT_W = 420
const DEFAULT_H = 560

function useResizable(defaultW: number, defaultH: number) {
  const [size, setSize] = React.useState({ w: defaultW, h: defaultH })
  const ref = React.useRef<{ edge: "left" | "top" | "corner"; sx: number; sy: number; sw: number; sh: number } | null>(null)

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

// ─── Thread avatar ────────────────────────────────────────────────────────────

function ThreadAvatar({ sender }: { sender: string }) {
  const initials = sender
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()

  const hue = Math.abs(
    sender.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  )

  return (
    <div
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: `hsl(${hue}, 60%, 50%)` }}
    >
      {initials || "?"}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

type Props = {
  open: boolean
  onClose: () => void
  onSendToAgent?: (prompt: string) => void
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

  // Animate in on mount
  React.useEffect(() => {
    if (open) requestAnimationFrame(() => setMounted(true))
    else setMounted(false)
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

  // Listen for prompt events dispatched by Command+K
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
          thread.messages
            .map((m) => `[${m.author}]: ${m.bodyText ?? m.body}`)
            .join("\n\n")
      )
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
      { id: assistantId, role: "assistant", content: "" },
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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
        )
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
      {/* Picker backdrop */}
      {pickerOpen ? (
        <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
      ) : null}

      {/* Thread picker — above panel, outside overflow-hidden */}
      {pickerOpen && !minimized ? (
        <div
          className="fixed right-6 z-[51] overflow-hidden rounded-2xl border bg-background/95 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10"
          style={{ bottom: pickerBottom, width: Math.min(size.w - 16, 360) }}
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-xs font-semibold tracking-wide text-foreground">
              Attach a thread
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
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
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
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

      {/* Floating panel */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl ring-1 ring-black/5 dark:ring-white/10",
          "transition-[opacity,transform] duration-200",
          mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        )}
        style={{ width: size.w, height: panelH }}
      >
        {/* Resize: left edge */}
        <div
          className="absolute bottom-2 left-0 top-14 w-1 cursor-ew-resize opacity-0 transition-opacity hover:opacity-100"
          onMouseDown={startResize("left")}
        >
          <div className="mx-auto h-full w-0.5 rounded-full bg-primary/40" />
        </div>

        {/* Resize: top edge (not when minimized) */}
        {!minimized ? (
          <div
            className="absolute left-2 right-2 top-0 h-1 cursor-ns-resize opacity-0 transition-opacity hover:opacity-100"
            onMouseDown={startResize("top")}
          >
            <div className="mx-auto w-8 h-0.5 rounded-full bg-primary/40 mt-0" />
          </div>
        ) : null}

        {/* Resize: top-left corner */}
        {!minimized ? (
          <div
            className="absolute left-0 top-0 z-10 size-6 cursor-nwse-resize"
            onMouseDown={startResize("corner")}
          />
        ) : null}

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="relative flex h-13 shrink-0 items-center gap-2.5 border-b bg-gradient-to-r from-primary/5 via-primary/3 to-transparent px-4">
          {/* Animated orb */}
          <div className="relative flex size-7 shrink-0 items-center justify-center">
            <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20" />
            <div className="relative flex size-7 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
              <HugeiconsIcon icon={AiChat01Icon} strokeWidth={1.5} className="size-3.5 text-primary" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">wsai</p>
            {!minimized && streaming ? (
              <p className="text-[10px] text-primary animate-pulse">Thinking…</p>
            ) : !minimized && messages.length > 0 ? (
              <p className="text-[10px] text-muted-foreground">{messages.length} message{messages.length !== 1 ? "s" : ""}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-0.5">
            <Link
              href="/agent"
              onClick={onClose}
              title="Open full agent"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={ExternalLinkIcon} strokeWidth={2} className="size-3.5" />
              <span className="sr-only">Full agent page</span>
            </Link>
            <button
              type="button"
              title={minimized ? "Expand" : "Minimize"}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setMinimized((v) => !v)}
            >
              <HugeiconsIcon icon={minimized ? AiChat01Icon : MinusSignIcon} strokeWidth={2} className="size-3.5" />
            </button>
            <button
              type="button"
              title="Close"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={onClose}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
            </button>
          </div>
        </div>

        {minimized ? null : (
          <>
            {/* ── Context chip ─────────────────────────────────────────────── */}
            {contextLabel ? (
              <div className="flex shrink-0 items-center gap-2 border-b bg-primary/5 px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1.5">
                  <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} className="size-3 shrink-0 text-primary" />
                  <span className="truncate text-[11px] font-medium text-primary">{contextLabel}</span>
                  <button
                    type="button"
                    onClick={clearAiContext}
                    className="ml-auto shrink-0 text-primary/60 transition-opacity hover:text-primary"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                    <span className="sr-only">Clear</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* ── Messages ─────────────────────────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
              {messages.length === 0 ? (
                <div className="flex flex-col gap-4 px-4 py-6">
                  {/* Branded empty state */}
                  <div className="flex flex-col items-center gap-3 py-2 text-center">
                    <div className="relative">
                      <div className="absolute -inset-3 animate-pulse rounded-full bg-primary/10" />
                      <div className="relative flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                        <HugeiconsIcon icon={CommandIcon} strokeWidth={1.5} className="size-6 text-primary" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">How can I help?</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Ask about your inbox, calendar, or anything workspace-related.
                      </p>
                    </div>
                  </div>
                  {/* Suggestion chips */}
                  <div className="grid gap-1.5">
                    {[
                      "What needs my attention today?",
                      "Summarize my unread inbox",
                      "Draft a polite reply",
                      "What's on my calendar this week?",
                    ].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="group flex items-center gap-3 rounded-xl border bg-gradient-to-r from-muted/30 to-transparent px-3 py-2.5 text-left text-xs text-muted-foreground transition-all hover:border-primary/30 hover:from-primary/5 hover:to-transparent hover:text-foreground"
                        onClick={() => void handleSend(s)}
                      >
                        <span className="size-1 shrink-0 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-primary/50" />
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4 px-4 py-4">
                  {messages.map((msg, index) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-2.5",
                        msg.role === "user" && "flex-row-reverse"
                      )}
                    >
                      {/* Avatar */}
                      {msg.role === "assistant" ? (
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 mt-0.5">
                          <HugeiconsIcon icon={CommandIcon} strokeWidth={2} className="size-3 text-primary" />
                        </div>
                      ) : (
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold mt-0.5 ring-1 ring-primary/30">
                          U
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={cn(
                          "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                          msg.role === "user"
                            ? "rounded-tr-sm bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
                            : "rounded-tl-sm bg-muted/60 text-foreground ring-1 ring-border/50"
                        )}
                      >
                        {msg.content === "" && streaming && index === messages.length - 1 ? (
                          <span className="inline-flex items-center gap-1.5 py-0.5">
                            <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:0ms]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:150ms]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:300ms]" />
                          </span>
                        ) : msg.role === "assistant" ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:leading-relaxed prose-code:text-xs prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:bg-black/10 dark:prose-code:bg-white/10">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={scrollRef} />
                </div>
              )}
            </div>

            {/* ── Input bar ───────────────────────────────────────────────── */}
            <div className="shrink-0 border-t bg-background/80 backdrop-blur-sm px-3 pb-3 pt-2.5">
              <div
                className={cn(
                  "flex items-end gap-2 rounded-xl border bg-muted/30 px-3 py-2 transition-all",
                  "focus-within:border-primary/40 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/20"
                )}
              >
                {/* Attach button */}
                <button
                  type="button"
                  title="Attach a thread"
                  className={cn(
                    "mb-0.5 shrink-0 rounded-lg p-1 transition-colors",
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
                  onChange={handleTextInput}
                  onKeyDown={handleKeyDown}
                  placeholder={streaming ? "Thinking…" : "Ask wsai anything…"}
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
                <div className="mt-1.5 flex items-center justify-end">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setMessages([])}
                  >
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
