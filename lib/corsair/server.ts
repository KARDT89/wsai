import { gmail } from "@corsair-dev/gmail"
import { googlecalendar } from "@corsair-dev/googlecalendar"
import { createCorsair } from "corsair"
import type { CorsairPlugin } from "corsair/core"
import { setupCorsair, type SetupCredentials } from "corsair/setup"
import { Pool } from "pg"

import { enqueueCorsairSync } from "@/inngest/events"
import type { SyncableCorsairPluginId } from "@/lib/corsair/sync"

const globalForCorsair = globalThis as unknown as {
  corsairPool?: Pool
}

const gmailPlugin = withOAuthScopes(
  gmail({
    webhookHooks: {
      messageChanged: {
        after: (ctx) => enqueueWebhookSync(ctx, "gmail"),
      },
    },
  }),
  ["https://www.googleapis.com/auth/gmail.readonly"]
)

const googleCalendarPlugin = withOAuthScopes(
  googlecalendar({
    webhookHooks: {
      onEventChanged: {
        after: (ctx) => enqueueWebhookSync(ctx, "googlecalendar"),
      },
    },
  }),
  ["https://www.googleapis.com/auth/calendar.readonly"]
)

export const corsairPlugins = [gmailPlugin, googleCalendarPlugin] as const

export type CorsairPluginId = (typeof corsairPlugins)[number]["id"]

export const primaryIntegrationIds = ["gmail", "googlecalendar"] as const

export function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "")
}

export function getCorsairRedirectUri() {
  return `${getAppUrl()}/api/corsair/callback`
}

export function getCorsairInstance() {
  const databaseUrl = process.env.DATABASE_URL
  const kek = process.env.CORSAIR_KEK ?? process.env.BETTER_AUTH_SECRET

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to use Corsair.")
  }

  if (!kek) {
    throw new Error("CORSAIR_KEK or BETTER_AUTH_SECRET is required to use Corsair.")
  }

  const pool =
    globalForCorsair.corsairPool ??
    new Pool({
      connectionString: databaseUrl,
    })

  if (process.env.NODE_ENV !== "production") {
    globalForCorsair.corsairPool = pool
  }

  return createCorsair({
    database: pool,
    plugins: corsairPlugins,
    multiTenancy: true,
    kek,
    connect: {
      baseUrl: `${getAppUrl()}/api/corsair/connect`,
      redirectUri: getCorsairRedirectUri(),
    },
    approval: {
      timeout: "10m",
      onTimeout: "deny",
      mode: "asynchronous",
    },
  })
}

export async function ensureCorsairSetup(tenantId: string, backfill = false) {
  const corsair = getCorsairInstance()
  const integrationLog = await setupCorsair(corsair, {
    credentials: getCorsairCredentials(),
  })
  const tenantLog = await setupCorsair(corsair, {
    tenantId,
    backfill,
  })

  return [integrationLog, tenantLog].filter(Boolean).join("\n")
}

export function isKnownCorsairPlugin(pluginId: string): pluginId is CorsairPluginId {
  return corsairPlugins.some((plugin) => plugin.id === pluginId)
}

export function getCorsairCredentials(): SetupCredentials {
  const credentials: SetupCredentials = {}

  const google = getCredentialPair([
    ["CORSAIR_GOOGLE_CLIENT_ID", "CORSAIR_GOOGLE_CLIENT_SECRET"],
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    ["BETTER_AUTH_GOOGLE_CLIENT_ID", "BETTER_AUTH_GOOGLE_CLIENT_SECRET"],
  ])

  if (google) {
    credentials.gmail = google
    credentials.googlecalendar = google
  }

  return credentials
}

export function getMissingCredentialLabels(pluginId: string) {
  if (pluginId === "gmail" || pluginId === "googlecalendar") {
    return googleCredentialLabels()
  }

  return []
}

function getCredentialPair(pairs: Array<[string, string]>) {
  for (const [clientIdKey, clientSecretKey] of pairs) {
    const clientId = process.env[clientIdKey]
    const clientSecret = process.env[clientSecretKey]

    if (clientId && clientSecret) {
      return {
        client_id: clientId,
        client_secret: clientSecret,
      }
    }
  }

  return null
}

function googleCredentialLabels() {
  return [
    "CORSAIR_GOOGLE_CLIENT_ID",
    "CORSAIR_GOOGLE_CLIENT_SECRET",
    "or GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET",
  ]
}

async function enqueueWebhookSync(
  ctx: Record<string, unknown>,
  plugin: SyncableCorsairPluginId
) {
  if (typeof ctx.tenantId !== "string") {
    return
  }

  await enqueueCorsairSync({
    tenantId: ctx.tenantId,
    plugin,
    reason: "corsair_webhook",
  })
}

function withOAuthScopes<TPlugin extends CorsairPlugin>(
  plugin: TPlugin,
  scopes: string[]
): TPlugin {
  return {
    ...plugin,
    oauthConfig: plugin.oauthConfig
      ? {
          ...plugin.oauthConfig,
          scopes,
          authParams: {
            ...plugin.oauthConfig.authParams,
            access_type: "offline",
            prompt: "consent select_account",
          },
        }
      : plugin.oauthConfig,
  }
}
