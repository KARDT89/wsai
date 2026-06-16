import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getCurrentSession } from "@/lib/session"

const triageLanes = [
  {
    id: "now",
    title: "Now",
    count: 6,
    accent: "border-sky-400 text-sky-300",
    items: [
      {
        source: "gmail",
        subject: "Investor follow-up needs answer before 11:30",
        from: "Maya Chen",
        reason: "Mentions revised terms and asks for confirmation today.",
        action: "Draft reply",
        time: "09:42",
      },
      {
        source: "calendar",
        subject: "Board prep starts in 48 minutes",
        from: "Workspace AI board",
        reason: "Agenda has open metrics and fundraising sections.",
        action: "Build brief",
        time: "10:00",
      },
      {
        source: "gmail",
        subject: "Security questionnaire unblocks enterprise trial",
        from: "Northstar Ops",
        reason: "Customer explicitly tied response to procurement approval.",
        action: "Assign owner",
        time: "10:18",
      },
    ],
  },
  {
    id: "waiting",
    title: "Waiting",
    count: 9,
    accent: "border-amber-300 text-amber-200",
    items: [
      {
        source: "gmail",
        subject: "Pilot contract redlines with counsel",
        from: "Legal",
        reason: "No movement since Friday; next step is outside counsel.",
        action: "Snooze",
        time: "Fri",
      },
      {
        source: "calendar",
        subject: "Design partner check-in awaiting notes",
        from: "Aster Labs",
        reason: "Meeting summary has two unresolved product asks.",
        action: "Mark waiting",
        time: "Mon",
      },
    ],
  },
  {
    id: "today",
    title: "Today",
    count: 14,
    accent: "border-emerald-300 text-emerald-200",
    items: [
      {
        source: "gmail",
        subject: "Candidate close packet review",
        from: "Recruiting",
        reason: "Offer details need founder approval before sending.",
        action: "Review",
        time: "13:00",
      },
      {
        source: "calendar",
        subject: "Pipeline review with GTM",
        from: "Revenue",
        reason: "Three enterprise opportunities changed stage overnight.",
        action: "Prep notes",
        time: "15:30",
      },
    ],
  },
  {
    id: "low",
    title: "Low",
    count: 23,
    accent: "border-zinc-700 text-zinc-400",
    items: [
      {
        source: "gmail",
        subject: "Newsletter mentions competitor launch",
        from: "Market scan",
        reason: "Useful context, no direct action required today.",
        action: "Archive later",
        time: "08:10",
      },
      {
        source: "gmail",
        subject: "Vendor renewal reminder",
        from: "Finance",
        reason: "Renewal window opens next month.",
        action: "Snooze",
        time: "Tue",
      },
    ],
  },
]

const calendarPrep = [
  ["10:00", "Board prep", "Missing MRR bridge and hiring plan delta"],
  ["13:00", "Candidate close", "Comp band approved; equity memo pending"],
  ["15:30", "Pipeline review", "Focus on Northstar, Mako, Horizon"],
]

const approvals = [
  ["gmail.api.messages.send", "Reply to Maya Chen", "pending"],
  ["gmail.api.threads.archive", "Archive 17 low-priority updates", "pending"],
  ["googlecalendar.api.events.create", "Schedule Aster follow-up", "queued"],
]

const integrations = [
  ["Gmail", "connected", "db + api"],
  ["Google Calendar", "connected", "db + api"],
  ["GitHub", "next", "registry module"],
  ["Slack", "next", "registry module"],
]

export default async function DashboardPage() {
  const session = await getCurrentSession()

  if (!session) {
    redirect("/login")
  }

  const tenantId = session.user.id
  const displayName = session.user.name || session.user.email || "founder"

  return (
    <main className="min-h-svh bg-[#05070a] text-zinc-100">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-sky-400/25 pb-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-sky-300">
              <span>wsai</span>
              <span className="h-px w-10 bg-sky-400/60" />
              <span>Workspace AI</span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                Founder cockpit
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Gmail, calendar, approvals, and agent work in one command
                surface for {displayName}.
              </p>
            </div>
          </div>
          <div className="grid gap-2 font-mono text-xs text-zinc-400 sm:grid-cols-3 lg:min-w-[520px]">
            <Metric label="tenant" value={tenantId.slice(0, 12)} />
            <Metric label="triage" value="52 open" />
            <Metric label="writes" value="approval gated" />
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-4">
          {triageLanes.map((lane) => (
            <div
              key={lane.id}
              className="min-h-[420px] border border-zinc-800 bg-black/45"
            >
              <div
                className={`flex items-center justify-between border-b px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] ${lane.accent}`}
              >
                <span>{lane.title}</span>
                <span>{lane.count}</span>
              </div>
              <div className="divide-y divide-zinc-900">
                {lane.items.map((item) => (
                  <article
                    key={`${lane.id}-${item.subject}`}
                    className="grid gap-3 px-3 py-4 transition-colors hover:bg-sky-400/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                          {item.source} / {item.from}
                        </p>
                        <h2 className="mt-1 text-sm font-medium leading-5 text-zinc-100">
                          {item.subject}
                        </h2>
                      </div>
                      <time className="font-mono text-xs text-zinc-500">
                        {item.time}
                      </time>
                    </div>
                    <p className="text-xs leading-5 text-zinc-400">
                      {item.reason}
                    </p>
                    <div className="flex items-center justify-between gap-3 font-mono text-xs">
                      <span className="text-sky-300">{item.action}</span>
                      <span className="text-zinc-600">requires approval</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-3 xl:grid-cols-[1fr_1fr_0.85fr]">
          <Panel title="Calendar prep" kicker="googlecalendar.db.events.search">
            <div className="divide-y divide-zinc-900">
              {calendarPrep.map(([time, title, detail]) => (
                <div
                  key={`${time}-${title}`}
                  className="grid grid-cols-[64px_1fr] gap-3 px-3 py-3"
                >
                  <span className="font-mono text-xs text-sky-300">{time}</span>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">
                      {detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Approval queue" kicker="agent write interception">
            <div className="divide-y divide-zinc-900">
              {approvals.map(([operation, label, status]) => (
                <div
                  key={operation}
                  className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-zinc-500">
                      {operation}
                    </p>
                    <p className="mt-1 text-sm text-zinc-100">{label}</p>
                  </div>
                  <span className="self-start border border-red-400/40 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-red-300">
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Integrations" kicker="Corsair only">
            <div className="divide-y divide-zinc-900">
              {integrations.map(([name, state, mode]) => (
                <div
                  key={name}
                  className="grid grid-cols-[1fr_auto] gap-3 px-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{name}</p>
                    <p className="mt-1 font-mono text-xs text-zinc-500">
                      {mode}
                    </p>
                  </div>
                  <span className="font-mono text-xs uppercase text-sky-300">
                    {state}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid gap-3 border border-zinc-800 bg-black/45 p-3 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-zinc-900 pb-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sky-300">
                  Agent session
                </p>
                <h2 className="mt-1 text-sm font-medium text-white">
                  Ask wsai to reason across the workspace
                </h2>
              </div>
              <span className="font-mono text-xs text-zinc-500">
                OpenAI + MCP
              </span>
            </div>
            <div className="space-y-3 font-mono text-sm leading-6">
              <p className="text-zinc-400">
                <span className="text-sky-300">founder:</span> What needs my
                attention before the board prep?
              </p>
              <p className="text-zinc-200">
                <span className="text-emerald-300">wsai:</span> Three items:
                investor reply, MRR bridge, and the enterprise security
                questionnaire. I can draft the email and create calendar prep,
                but writes will enter approvals first.
              </p>
            </div>
          </div>
          <div className="border border-zinc-900 p-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
              Command palette targets
            </p>
            <div className="mt-3 grid gap-2 font-mono text-xs text-zinc-400">
              <span>/threads search projected Gmail</span>
              <span>/events build meeting brief</span>
              <span>/approve review pending writes</span>
              <span>/connect refresh Corsair links</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 bg-black/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
        {label}
      </p>
      <p className="mt-1 truncate text-zinc-200">{value}</p>
    </div>
  )
}

function Panel({
  title,
  kicker,
  children,
}: {
  title: string
  kicker: string
  children: ReactNode
}) {
  return (
    <div className="border border-zinc-800 bg-black/45">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-900 px-3 py-2">
        <h2 className="text-sm font-medium text-zinc-100">{title}</h2>
        <span className="truncate font-mono text-[11px] text-zinc-500">
          {kicker}
        </span>
      </div>
      {children}
    </div>
  )
}
