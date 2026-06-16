import { redirect } from "next/navigation"
import { getCurrentSession } from "@/lib/session"

export default async function DashboardPage() {
  const session = await getCurrentSession()

  if (!session) {
    redirect("/login")
  }

  const tenantId = session.user.id

  return (
    <main className="min-h-svh bg-background px-6 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-2 border-b pb-6">
          <p className="text-sm font-medium text-primary">Dashboard</p>
          <h1 className="text-3xl font-semibold tracking-normal">
            Good to see you, {session.user.name || session.user.email}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Tenant ID is mapped to your Better Auth user ID:{" "}
            <span className="font-mono text-foreground">{tenantId}</span>
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["Inbox triage", "Gmail threads projected through Corsair."],
            ["Calendar prep", "Upcoming meetings with context and briefs."],
            ["Approval queue", "Agent write actions waiting for review."],
          ].map(([title, description]) => (
            <div key={title} className="rounded-lg border bg-card p-4">
              <h2 className="font-medium">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
