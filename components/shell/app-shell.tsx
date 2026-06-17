"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AiChat01Icon,
  AiMail01Icon,
  CalendarDaysIcon,
  CommandIcon,
  Database01Icon,
  Logout01Icon,
  Mail01Icon,
  MoreVerticalCircle01Icon,
  SearchIcon,
  Settings05Icon,
  Shield01Icon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons"

import { useTheme } from "next-themes"
import { MoonIcon, SunIcon } from "@phosphor-icons/react"

import { authClient } from "@/lib/auth-client"
import { useAiContext } from "@/lib/ai-context"
import { AiChatFloat } from "@/components/shell/ai-chat-float"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type AppShellProps = {
  children: React.ReactNode
  user: {
    name?: string | null
    email?: string | null
  }
}

const navItems = [
  { href: "/mail", label: "Mail", icon: Mail01Icon, badge: "18" },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/agent", label: "Agent", icon: AiMail01Icon },
  { href: "/approvals", label: "Approvals", icon: Shield01Icon },
  { href: "/settings", label: "Settings", icon: Settings05Icon },
  { href: "/integrations", label: "Integrations", icon: Database01Icon },
]

const sectionLabels: Record<string, string> = {
  "/mail": "Mail",
  "/calendar": "Calendar",
  "/agent": "Agent",
  "/approvals": "Approvals",
  "/settings": "Settings",
  "/integrations": "Integrations",
}

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [aiOpen, setAiOpen] = React.useState(false)
  const [isSigningOut, setIsSigningOut] = React.useState(false)
  const [pendingApprovals, setPendingApprovals] = React.useState(0)
  useAiContext()
  const { theme, setTheme } = useTheme()

  const refreshPendingApprovals = React.useCallback(async () => {
    try {
      const response = await fetch("/api/approvals?status=pending", {
        cache: "no-store",
      })
      if (!response.ok) return

      const data = (await response.json()) as { pendingCount?: number }
      setPendingApprovals(data.pendingCount ?? 0)
    } catch {
      // The badge is helpful context, not a blocker for using the shell.
    }
  }, [])

  // Global keyboard shortcuts
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Cmd/Ctrl+K → command palette
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
      // Cmd/Ctrl+I → AI assistant
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
        event.preventDefault()
        setAiOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  React.useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshPendingApprovals()
    }, 0)

    const interval = window.setInterval(() => {
      void refreshPendingApprovals()
    }, 60_000)

    function onFocus() {
      void refreshPendingApprovals()
    }

    window.addEventListener("focus", onFocus)
    return () => {
      window.clearTimeout(initialRefresh)
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
    }
  }, [refreshPendingApprovals])

  const activeItem =
    navItems.find((item) => pathname.startsWith(item.href)) ?? navItems[0]
  const sectionName = sectionLabels[activeItem.href] ?? "Mail"

  async function handleSignOut() {
    setIsSigningOut(true)
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  function openAiWithPrompt(prompt: string) {
    setCommandOpen(false)
    setAiOpen(true)
    // brief delay so the float renders before we try to interact with it
    setTimeout(() => {
      // Dispatch a custom event the float can listen for if needed
      window.dispatchEvent(new CustomEvent("wsai:prompt", { detail: { prompt } }))
    }, 150)
  }

  return (
    <div className="flex h-svh min-h-0 overflow-hidden bg-background text-foreground">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="hidden min-h-0 w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <HugeiconsIcon icon={CommandIcon} strokeWidth={2} className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">wsai</p>
            <p className="truncate text-xs text-muted-foreground">Workspace AI</p>
          </div>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            const badge =
              item.href === "/approvals"
                ? pendingApprovals > 0
                  ? String(pendingApprovals)
                  : undefined
                : item.badge
            return (
              <Button
                key={item.href}
                asChild
                variant={active ? "secondary" : "ghost"}
                className={cn(
                  "h-9 justify-start gap-2 rounded-md px-2",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <Link href={item.href}>
                  <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-4" />
                  <span>{item.label}</span>
                  {badge ? (
                    <span className="ml-auto rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                      {badge}
                    </span>
                  ) : null}
                </Link>
              </Button>
            )
          })}
        </nav>

        <div className="border-t p-2">
          {/* AI assistant shortcut button */}
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full justify-start gap-2 rounded-md px-2"
            onClick={() => setAiOpen((v) => !v)}
          >
            <HugeiconsIcon icon={AiChat01Icon} strokeWidth={2} className="size-4" />
            <span>AI assistant</span>
            <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘I
            </kbd>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="mt-1 h-auto w-full justify-start gap-2 rounded-md px-2 py-2"
              >
                <HugeiconsIcon
                  icon={UserCircle02Icon}
                  strokeWidth={2}
                  className="size-4 text-muted-foreground"
                />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">{user.name ?? "Workspace"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <HugeiconsIcon
                  icon={MoreVerticalCircle01Icon}
                  strokeWidth={2}
                  className="size-4 text-muted-foreground"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="min-w-56">
              <DropdownMenuLabel>
                <span className="block truncate text-foreground">{user.name ?? "Workspace"}</span>
                <span className="block truncate font-normal">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/settings")}>
                <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Appearance</DropdownMenuLabel>
              <div className="flex gap-1 px-2 pb-1">
                <button
                  onClick={() => setTheme("light")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors",
                    theme === "light"
                      ? "border-foreground/20 bg-muted font-medium"
                      : "border-transparent hover:bg-muted/60"
                  )}
                >
                  <SunIcon className="size-3" />
                  Light
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors",
                    theme === "dark"
                      ? "border-foreground/20 bg-muted font-medium"
                      : "border-transparent hover:bg-muted/60"
                  )}
                >
                  <MoonIcon className="size-3" />
                  Dark
                </button>
                <button
                  onClick={() => setTheme("system")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors",
                    theme === "system"
                      ? "border-foreground/20 bg-muted font-medium"
                      : "border-transparent hover:bg-muted/60"
                  )}
                >
                  Auto
                </button>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={isSigningOut}
                onSelect={(event) => {
                  event.preventDefault()
                  void handleSignOut()
                }}
              >
                <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
                {isSigningOut ? "Logging out…" : "Log out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 lg:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="lg:hidden">
              <Button asChild variant="ghost" size="icon-sm">
                <Link href="/mail">
                  <HugeiconsIcon icon={CommandIcon} strokeWidth={2} />
                  <span className="sr-only">wsai home</span>
                </Link>
              </Button>
            </div>
            <div className="min-w-32">
              <p className="truncate text-sm font-medium">{sectionName}</p>
            </div>
            <div className="relative hidden w-full max-w-2xl md:block">
              <HugeiconsIcon
                icon={SearchIcon}
                strokeWidth={2}
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="h-8 rounded-md pl-8"
                placeholder="Search mail, events, commands, people"
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="hidden gap-2 sm:inline-flex"
            onClick={() => setCommandOpen(true)}
          >
            <HugeiconsIcon icon={CommandIcon} strokeWidth={2} className="size-4" />
            <span>Command</span>
            <kbd className="font-mono text-xs text-muted-foreground">⌘K</kbd>
          </Button>

          <Button
            type="button"
            className={cn(
              "hidden gap-2 sm:inline-flex",
              aiOpen
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-violet-500/40 bg-violet-500/10 text-foreground hover:bg-violet-500/20 hover:border-violet-500/60"
            )}
            onClick={() => setAiOpen((v) => !v)}
          >
            <HugeiconsIcon icon={AiChat01Icon} strokeWidth={2} className="size-4" />
            Ask AI
            <kbd className="font-mono text-[10px] opacity-60">⌘I</kbd>
          </Button>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      {/* ── Command palette ──────────────────────────────────────────────── */}
      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="Command Palette"
        description="Search, navigate, or launch an AI action."
        className="max-w-2xl"
      >
        <Command>
          <CommandInput placeholder="Search commands, navigate, ask wsai…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup heading="AI actions">
              <CommandItem onSelect={() => openAiWithPrompt("What needs my attention today?")}>
                <HugeiconsIcon icon={AiChat01Icon} strokeWidth={2} className="size-4" />
                What needs my attention today?
                <CommandShortcut>AI</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => openAiWithPrompt("Summarize my unread inbox")}>
                <HugeiconsIcon icon={AiChat01Icon} strokeWidth={2} className="size-4" />
                Summarize unread inbox
              </CommandItem>
              <CommandItem onSelect={() => openAiWithPrompt("Draft a polite reply to the latest thread")}>
                <HugeiconsIcon icon={AiChat01Icon} strokeWidth={2} className="size-4" />
                Draft a reply to latest thread
              </CommandItem>
              <CommandItem onSelect={() => openAiWithPrompt("What's on my calendar this week?")}>
                <HugeiconsIcon icon={AiChat01Icon} strokeWidth={2} className="size-4" />
                What&apos;s on my calendar this week?
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Navigation">
              {navItems.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => {
                    setCommandOpen(false)
                    router.push(item.href)
                  }}
                >
                  <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-4" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      {/* ── Floating AI chat ────────────────────────────────────────────── */}
      <AiChatFloat open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  )
}
