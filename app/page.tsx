import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  CalendarDaysIcon,
  InboxIcon,
  Shield01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { getCurrentSession } from "@/lib/session"

export default async function Home() {
  const session = await getCurrentSession()
  const href = session ? "/dashboard" : "/signup"

  return (
    <main className="min-h-svh bg-background text-foreground">
      <section className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold">
            wsai
          </Link>
          <nav className="flex items-center gap-2">
            {session ? (
              <Button asChild variant="outline">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost">
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Sign up</Link>
                </Button>
              </>
            )}
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1fr_0.92fr]">
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium text-primary">
              Gmail and Google Calendar triage for founders
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal sm:text-6xl">
              wsai
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              Workspace AI is a fast operating cockpit for the inbox, calendar,
              approvals, and agent work that decide your day. Integrations run
              through Corsair, with your Better Auth user ID as the tenant ID.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href={href}>
                  {session ? "Open dashboard" : "Start triaging"}
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <p className="text-sm font-medium">Today</p>
                <p className="text-xs text-muted-foreground">
                  Triage lanes by urgency
                </p>
              </div>
              <span className="rounded-md bg-primary/15 px-2 py-1 text-xs text-primary">
                Live cockpit
              </span>
            </div>
            <div className="grid gap-3 pt-4">
              {[
                {
                  icon: InboxIcon,
                  title: "Inbox",
                  value: "14 need a decision",
                  detail: "Grouped by sender, commitment, and deadline.",
                },
                {
                  icon: CalendarDaysIcon,
                  title: "Calendar",
                  value: "3 meetings need prep",
                  detail: "Briefs generated from recent email context.",
                },
                {
                  icon: Shield01Icon,
                  title: "Approvals",
                  value: "2 actions waiting",
                  detail: "Agent writes pause for explicit approval.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="grid grid-cols-[2rem_1fr] gap-3 rounded-lg border bg-background p-3"
                >
                  <div className="flex size-8 items-center justify-center rounded-md bg-muted text-primary">
                    <HugeiconsIcon icon={item.icon} className="size-4" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.value}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
