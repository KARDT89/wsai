import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { AppShell } from "@/components/shell/app-shell"
import { getCurrentSession } from "@/lib/session"

export default async function ShellLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await getCurrentSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email,
      }}
    >
      {children}
    </AppShell>
  )
}
