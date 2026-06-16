"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
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

import { authClient } from "@/lib/auth-client"
import { ModeToggle } from "@/components/theme-toggle"
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
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
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
  { href: "/approvals", label: "Approvals", icon: Shield01Icon, badge: "3" },
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

const actionLabels: Record<string, string> = {
  "/mail": "Compose Email",
  "/calendar": "New Event",
  "/agent": "New Task",
  "/approvals": "Review Queue",
  "/settings": "Save Preferences",
  "/integrations": "Connect App",
}

const actionHrefs: Record<string, string> = {
  "/mail": "/mail",
  "/calendar": "/calendar",
  "/agent": "/agent",
  "/approvals": "/approvals",
  "/settings": "/settings",
  "/integrations": "/integrations",
}

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [aiOpen, setAiOpen] = React.useState(false)
  const [isSigningOut, setIsSigningOut] = React.useState(false)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const activeItem =
    navItems.find((item) => pathname.startsWith(item.href)) ?? navItems[0]
  const sectionName = sectionLabels[activeItem.href] ?? "Mail"
  const actionLabel = actionLabels[activeItem.href] ?? "Compose"
  const actionHref = actionHrefs[activeItem.href] ?? "/mail"

  async function handleSignOut() {
    setIsSigningOut(true)
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <HugeiconsIcon icon={CommandIcon} strokeWidth={2} className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">wsai</p>
            <p className="truncate text-xs text-muted-foreground">
              Workspace AI
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)

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
                  {item.badge ? (
                    <span className="ml-auto rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              </Button>
            )
          })}
        </nav>

        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full justify-start gap-2 rounded-md px-2"
            onClick={() => setAiOpen(true)}
          >
            <HugeiconsIcon icon={AiMail01Icon} strokeWidth={2} className="size-4" />
            AI drawer
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 h-auto w-full justify-start gap-2 rounded-md px-2 py-2"
              >
                <HugeiconsIcon
                  icon={UserCircle02Icon}
                  strokeWidth={2}
                  className="size-4 text-muted-foreground"
                />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">
                    {user.name ?? "Workspace"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
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
                <span className="block truncate text-foreground">
                  {user.name ?? "Workspace"}
                </span>
                <span className="block truncate font-normal">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/settings")}>
                <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />
                Settings
              </DropdownMenuItem>
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
                {isSigningOut ? "Logging out..." : "Log out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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
            <div className="min-w-[8rem]">
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
            <span className="font-mono text-xs text-muted-foreground">K</span>
          </Button>
          <ModeToggle />
          <Button asChild>
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="Command Palette"
        description="Search, navigate, or ask wsai to prepare an action."
        className="max-w-2xl"
      >
        <Command>
          <CommandInput placeholder="Try: summarize selected thread" />
          <CommandList>
            <CommandEmpty>No command found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => setAiOpen(true)}>
                Ask wsai about current context
                <CommandShortcut>AI</CommandShortcut>
              </CommandItem>
              <CommandItem>Compose email</CommandItem>
              <CommandItem>Schedule meeting</CommandItem>
              <CommandItem>Archive selected thread</CommandItem>
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
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="AI commands">
              <CommandItem>Summarize this email thread</CommandItem>
              <CommandItem>Draft a polite reply</CommandItem>
              <CommandItem>Find emails about Q2 budget</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>wsai assistant</SheetTitle>
            <SheetDescription>
              Context: {sectionName}
            </SheetDescription>
          </SheetHeader>
          <Separator />
          <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
            <div className="space-y-3 overflow-auto rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-muted-foreground">
                Ask me to summarize, draft, search, schedule, or prepare an
                action. Write operations will be routed through approvals.
              </p>
              <div className="rounded-md bg-background p-3">
                <p className="font-medium">Suggested</p>
                <p className="mt-1 text-muted-foreground">
                  Summarize the selected thread and propose a reply.
                </p>
              </div>
            </div>
            <div className="mt-auto space-y-2">
              <Textarea
                className="min-h-24"
                placeholder="Ask wsai anything about this workspace"
              />
              <Button type="button" className="w-full">
                Send to wsai
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
