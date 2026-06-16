"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CalendarDaysIcon,
  Database01Icon,
  Mail01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type IntegrationStatus = "connected" | "not_connected" | "missing_credentials"

type Integration = {
  id: string
  name: string
  description: string
  surface: string
  enabled: boolean
  status: IntegrationStatus
  entityCount: number
  missingCredentials: string[]
}

type IntegrationsResponse = {
  integrations: Integration[]
}

const integrationIcons: Record<string, typeof Mail01Icon> = {
  gmail: Mail01Icon,
  googlecalendar: CalendarDaysIcon,
  github: Database01Icon,
}

export function IntegrationsDashboard() {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const connected = searchParams.get("connected")
  const oauthError = searchParams.get("error")
  const syncError = searchParams.get("sync_error")
  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: fetchIntegrations,
  })
  const syncMutation = useMutation({
    mutationFn: syncIntegration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] })
      queryClient.invalidateQueries({ queryKey: ["mail", "threads"] })
      queryClient.invalidateQueries({ queryKey: ["calendar", "events"] })
    },
  })

  const integrations = integrationsQuery.data?.integrations ?? []
  const primaryIntegrations = integrations.filter((integration) =>
    ["gmail", "googlecalendar"].includes(integration.id)
  )
  const laterIntegrations = integrations.filter(
    (integration) => !["gmail", "googlecalendar"].includes(integration.id)
  )

  return (
    <main className="flex min-h-full flex-col gap-5 overflow-auto p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-normal">Connect apps</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Connect Gmail and Google Calendar with Corsair OAuth. WSAI stores
            account tokens per Better Auth user tenant and reads synced entities
            from your database.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={integrationsQuery.isFetching}
          onClick={() => integrationsQuery.refetch()}
        >
          <HugeiconsIcon icon={RefreshIcon} className="size-4" />
          Refresh status
        </Button>
      </div>

      {connected ? (
        <Alert>
          <AlertTitle>Connected</AlertTitle>
          <AlertDescription>
            {formatIntegrationName(connected)} is connected and the first sync
            has been requested.
          </AlertDescription>
        </Alert>
      ) : null}

      {oauthError ? (
        <Alert variant="destructive">
          <AlertTitle>Connection failed</AlertTitle>
          <AlertDescription>{oauthError}</AlertDescription>
        </Alert>
      ) : null}

      {syncError ? (
        <Alert>
          <AlertTitle>Connected, sync needs a retry</AlertTitle>
          <AlertDescription>{syncError}</AlertDescription>
        </Alert>
      ) : null}

      {integrationsQuery.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : null}

      {integrationsQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load integrations</AlertTitle>
          <AlertDescription>
            {integrationsQuery.error instanceof Error
              ? integrationsQuery.error.message
              : "Check the Corsair environment variables and database tables."}
          </AlertDescription>
        </Alert>
      ) : null}

      {!integrationsQuery.isLoading && primaryIntegrations.length > 0 ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {primaryIntegrations.map((integration) => (
            <ConnectCard
              key={integration.id}
              integration={integration}
              syncMutation={syncMutation}
            />
          ))}
        </section>
      ) : null}

      {!integrationsQuery.isLoading && primaryIntegrations.length > 0 ? (
        <section className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium">1. OAuth</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Click Connect and approve the Google OAuth consent screen.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium">2. Tenant tokens</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Corsair saves tokens under your Better Auth user id as tenant id.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium">3. Cached data</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Sync writes mail threads and calendar events into `corsair_entities`.
            </p>
          </div>
        </section>
      ) : null}

      {laterIntegrations.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-medium">Available later</h2>
            <p className="text-sm text-muted-foreground">
              These plugins are installed or planned, but they are not part of
              the first mail/calendar workspace flow yet.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {laterIntegrations.map((integration) => (
              <ConnectCard
                key={integration.id}
                integration={integration}
                syncMutation={syncMutation}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}

function ConnectCard({
  integration,
  syncMutation,
}: {
  integration: Integration
  syncMutation: UseMutationResult<unknown, Error, string>
}) {
  const Icon = integrationIcons[integration.id] ?? Database01Icon
  const isSyncing = syncMutation.variables === integration.id
  const canConnect =
    integration.enabled && integration.status !== "missing_credentials"
  const isConnected = integration.status === "connected"
  const targetHref = `/api/integrations/${integration.id}/connect`

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-muted">
            <HugeiconsIcon icon={Icon} className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle>{integration.name}</CardTitle>
            <CardDescription>{integration.surface}</CardDescription>
          </div>
        </div>
        <CardAction>
          <StatusBadge status={integration.status} enabled={integration.enabled} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {integration.description}
        </p>

        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">OAuth</div>
            <div className="truncate text-base font-semibold">
              {integration.status === "connected" ? "Ready" : "Needed"}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Cached records</div>
            <div className="text-base font-semibold">
              {integration.entityCount}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Source</div>
            <div className="truncate text-base font-semibold">Corsair</div>
          </div>
        </div>

        {integration.status === "missing_credentials" ? (
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Add {integration.missingCredentials.join(", ")} to enable OAuth.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {canConnect ? (
            <Button asChild>
              <Link href={targetHref}>
                {isConnected
                  ? `Reconnect ${integration.name}`
                  : `Connect ${integration.name}`}
              </Link>
            </Button>
          ) : (
            <Button disabled>
              {integration.enabled ? "Missing credentials" : "Later"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!isConnected || isSyncing}
            onClick={() => syncMutation.mutate(integration.id)}
          >
            <HugeiconsIcon icon={RefreshIcon} className="size-4" />
            {isSyncing ? "Syncing" : "Sync now"}
          </Button>
          {isConnected && integration.id === "gmail" ? (
            <Button asChild variant="ghost">
              <Link href="/mail">Open mail</Link>
            </Button>
          ) : null}
          {isConnected && integration.id === "googlecalendar" ? (
            <Button asChild variant="ghost">
              <Link href="/calendar">Open calendar</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function IntegrationSkeleton() {
  return (
    <main className="flex min-h-full flex-col gap-5 overflow-auto p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </main>
  )
}

async function fetchIntegrations(): Promise<IntegrationsResponse> {
  const response = await fetch("/api/integrations")

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? "Unable to load integrations.")
  }

  return response.json()
}

async function syncIntegration(plugin: string) {
  const response = await fetch(`/api/integrations/${plugin}/sync`, {
    method: "POST",
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? "Unable to sync integration.")
  }

  return response.json()
}

function StatusBadge({
  status,
  enabled,
}: {
  status: IntegrationStatus
  enabled: boolean
}) {
  if (!enabled) {
    return <Badge variant="outline">Later</Badge>
  }

  if (status === "connected") {
    return <Badge>Connected</Badge>
  }

  if (status === "missing_credentials") {
    return <Badge variant="destructive">Needs OAuth app</Badge>
  }

  return <Badge variant="secondary">Not connected</Badge>
}

function formatIntegrationName(plugin: string) {
  if (plugin === "gmail") return "Gmail"
  if (plugin === "googlecalendar") return "Google Calendar"
  if (plugin === "github") return "GitHub"
  return plugin
}

export { IntegrationSkeleton }
