import { randomUUID } from "node:crypto"

import { gmail } from "@corsair-dev/gmail"
import type { GmailPluginOptions } from "@corsair-dev/gmail"
import { googlecalendar } from "@corsair-dev/googlecalendar"
import type { GoogleCalendarPluginOptions } from "@corsair-dev/googlecalendar"
import { createCorsair } from "corsair"
import type { CorsairPlugin } from "corsair/core"
import { setupCorsair, type SetupCredentials } from "corsair/setup"
import { Pool } from "pg"

import { inngest } from "@/inngest/client"
import {
  findActiveWebhookChannel,
  recordWebhookChannel,
} from "@/lib/corsair/webhook-channels"


const globalForCorsair = globalThis as unknown as {
  corsairPool?: Pool
}

export type ApprovalStrict = "all" | "writes" | "never"

type GmailApprovalOverrides = NonNullable<
  NonNullable<GmailPluginOptions["permissions"]>["overrides"]
>
type CalendarApprovalOverrides = NonNullable<
  NonNullable<GoogleCalendarPluginOptions["permissions"]>["overrides"]
>

const GMAIL_WRITE_APPROVAL_OVERRIDES = {
  "messages.send": "require_approval",
  "messages.modify": "require_approval",
  "messages.batchModify": "require_approval",
  "messages.trash": "require_approval",
  "messages.untrash": "require_approval",
  "messages.delete": "require_approval",
  "drafts.create": "require_approval",
  "drafts.update": "require_approval",
  "drafts.delete": "require_approval",
  "drafts.send": "require_approval",
  "threads.modify": "require_approval",
  "threads.trash": "require_approval",
  "threads.untrash": "require_approval",
  "threads.delete": "require_approval",
  "labels.create": "require_approval",
  "labels.update": "require_approval",
  "labels.delete": "require_approval",
} satisfies GmailApprovalOverrides

const GMAIL_ALL_APPROVAL_OVERRIDES = {
  "messages.list": "require_approval",
  "messages.get": "require_approval",
  "labels.list": "require_approval",
  "labels.get": "require_approval",
  "drafts.list": "require_approval",
  "drafts.get": "require_approval",
  "threads.list": "require_approval",
  "threads.get": "require_approval",
  ...GMAIL_WRITE_APPROVAL_OVERRIDES,
} satisfies GmailApprovalOverrides

const CALENDAR_WRITE_APPROVAL_OVERRIDES = {
  "events.create": "require_approval",
  "events.update": "require_approval",
  "events.delete": "require_approval",
} satisfies CalendarApprovalOverrides

const CALENDAR_ALL_APPROVAL_OVERRIDES = {
  "events.get": "require_approval",
  "events.getMany": "require_approval",
  "calendar.getAvailability": "require_approval",
  ...CALENDAR_WRITE_APPROVAL_OVERRIDES,
} satisfies CalendarApprovalOverrides

const WEBHOOK_SYNC_EVENT_NAMES = {
  gmail: "corsair/gmail.sync.requested",
  googlecalendar: "corsair/calendar.sync.requested",
} as const

function normalizeApprovalStrict(value?: string | null): ApprovalStrict {
  if (value === "all" || value === "never") return value
  return "writes"
}

function getGmailPermissions(approvalStrict: ApprovalStrict) {
  if (approvalStrict === "never") return undefined

  return {
    mode: "cautious" as const,
    overrides:
      approvalStrict === "all"
        ? GMAIL_ALL_APPROVAL_OVERRIDES
        : GMAIL_WRITE_APPROVAL_OVERRIDES,
  }
}

function getCalendarPermissions(approvalStrict: ApprovalStrict) {
  if (approvalStrict === "never") return undefined

  return {
    mode: "cautious" as const,
    overrides:
      approvalStrict === "all"
        ? CALENDAR_ALL_APPROVAL_OVERRIDES
        : CALENDAR_WRITE_APPROVAL_OVERRIDES,
  }
}

function createCorsairPlugins({
  approvalStrict = "never",
}: { approvalStrict?: ApprovalStrict } = {}) {
  const gmailPlugin = withOAuthScopes(
    gmail({
      permissions: getGmailPermissions(approvalStrict),
      webhookHooks: {
        messageChanged: {
          after: async (ctx, result) => {
            await enqueueWebhookSync("gmail", ctx, result)
          },
        },
      },
    }),
    [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.compose",
    ]
  )

  const googleCalendarPlugin = withOAuthScopes(
    googlecalendar({
      permissions: getCalendarPermissions(approvalStrict),
      webhookHooks: {
        onEventChanged: {
          after: async (ctx, result) => {
            await enqueueWebhookSync("googlecalendar", ctx, result)
          },
        },
      },
    }),
    [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ]
  )

  return [gmailPlugin, googleCalendarPlugin] as const
}

export const corsairPlugins = createCorsairPlugins()

export type CorsairPluginId = (typeof corsairPlugins)[number]["id"]

export const primaryIntegrationIds = ["gmail", "googlecalendar"] as const

export function getAppUrl() {
  // CORSAIR_WEBHOOK_URL is specifically for Corsair's webhook registration and
  // OAuth redirect URI. Use this for ngrok in local dev without breaking auth.
  return (
    process.env.CORSAIR_WEBHOOK_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "")
}

export function getCorsairRedirectUri() {
  return `${getAppUrl()}/api/corsair/callback`
}

export function getCorsairWebhookUrl(_tenantId?: string) {
  void _tenantId
  return `${getAppUrl()}/api/webhooks`
}

export function getCorsairInstance() {
  return createCorsairInstance("never")
}

export function getCorsairAgentInstance(approvalStrict: string | null = "writes") {
  return createCorsairInstance(normalizeApprovalStrict(approvalStrict))
}

function createCorsairInstance(approvalStrict: ApprovalStrict) {
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
    plugins:
      approvalStrict === "never"
        ? corsairPlugins
        : createCorsairPlugins({ approvalStrict }),
    multiTenancy: true,
    kek,
    connect: {
      baseUrl: `${getAppUrl()}/api/corsair/connect`,
      redirectUri: getCorsairRedirectUri(),
    },
    approval: {
      timeout: "60m",
      onTimeout: "deny",
      mode: "asynchronous",
      formatAsyncMessage: ({ plugin, endpoint }) =>
        `Approval required for ${plugin}.${endpoint}. Ask the user to review it at /approvals, then stop.`,
    },
  })
}

// Skip the expensive setupCorsair calls if this tenant has already been set up
// in this process lifetime. setupCorsair is idempotent so it's safe to skip.
const setupDoneFor = new Set<string>()

export async function ensureCorsairSetup(tenantId: string, backfill = false) {
  const cacheKey = `${tenantId}:${backfill}`
  if (setupDoneFor.has(cacheKey)) return

  const corsair = getCorsairInstance()
  const integrationLog = await setupCorsair(corsair, {
    credentials: getCorsairCredentials(),
  })
  const tenantLog = await setupCorsair(corsair, {
    tenantId,
    backfill,
  })

  if (backfill) {
    await ensureGoogleCalendarWebhookChannel(tenantId).catch((error) => {
      console.warn(
        "[corsair:googlecalendar] Unable to register Calendar webhook channel:",
        error instanceof Error ? error.message : error
      )
    })
  }

  setupDoneFor.add(cacheKey)
  return [integrationLog, tenantLog].filter(Boolean).join("\n")
}

export function invalidateCorsairSetupCache(tenantId: string) {
  for (const key of setupDoneFor) {
    if (key.startsWith(`${tenantId}:`)) setupDoneFor.delete(key)
  }
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
    credentials.gmail = {
      ...google,
      ...getOptionalCredentialFields({
        topic_id: ["CORSAIR_GMAIL_TOPIC_ID", "GMAIL_TOPIC_ID"],
      }),
    }
    credentials.googlecalendar = google
  }

  return credentials
}

function getOptionalCredentialFields(fields: Record<string, string[]>) {
  const result: Record<string, string> = {}

  for (const [field, envKeys] of Object.entries(fields)) {
    const value = envKeys.map((key) => process.env[key]).find(Boolean)
    if (value) result[field] = value
  }

  return result
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

async function ensureGoogleCalendarWebhookChannel(tenantId: string) {
  const calendarId = "primary"
  const activeChannel = await findActiveWebhookChannel({
    tenantId,
    plugin: "googlecalendar",
    calendarId,
  })

  if (activeChannel) return

  const tenant = getCorsairInstance().withTenant(tenantId)
  const calendarClient = tenant.googlecalendar as unknown as {
    api: {
      events: {
        getMany: (args: {
          calendarId?: string
          timeMin?: string
          timeMax?: string
          maxResults?: number
        }) => Promise<unknown>
      }
    }
    keys?: {
      get_access_token?: () => Promise<string | null>
    }
  }

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Touch the plugin first so Corsair refreshes and persists the access token.
  await calendarClient.api.events.getMany({
    calendarId,
    timeMin: now.toISOString(),
    timeMax: tomorrow.toISOString(),
    maxResults: 1,
  })

  const accessToken = await calendarClient.keys?.get_access_token?.()
  if (!accessToken) {
    throw new Error("Google Calendar access token is unavailable.")
  }

  const channelId = randomUUID()
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: getCorsairWebhookUrl(),
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`Calendar watch failed: ${await response.text()}`)
  }

  const payload = (await response.json()) as {
    resourceId?: string
    expiration?: string
  }
  const expirationMs = payload.expiration ? Number(payload.expiration) : NaN

  await recordWebhookChannel({
    tenantId,
    plugin: "googlecalendar",
    channelId,
    resourceId: payload.resourceId,
    calendarId,
    expiresAt: Number.isFinite(expirationMs) ? new Date(expirationMs) : null,
  })
}

async function enqueueWebhookSync(
  plugin: keyof typeof WEBHOOK_SYNC_EVENT_NAMES,
  ctx: unknown,
  result: unknown
) {
  const tenantId = getWebhookTenantId(ctx)

  if (!tenantId) {
    console.warn(`[corsair:${plugin}] Webhook processed without tenantId; skipping sync dispatch.`)
    return
  }

  await inngest.send({
    name: WEBHOOK_SYNC_EVENT_NAMES[plugin],
    data: {
      tenantId,
      plugin,
      reason: "webhook",
      webhook: summarizeWebhookResult(result),
    },
  })
}

function getWebhookTenantId(ctx: unknown) {
  if (!ctx || typeof ctx !== "object") return null

  const tenantId = (ctx as { tenantId?: unknown }).tenantId
  return typeof tenantId === "string" && tenantId.length > 0 ? tenantId : null
}

function summarizeWebhookResult(result: unknown) {
  if (!result || typeof result !== "object") return undefined

  const data = (result as { data?: unknown }).data
  if (!data || typeof data !== "object") return undefined

  const type = (data as { type?: unknown }).type
  const corsairEntityId = (result as { corsairEntityId?: unknown }).corsairEntityId

  return {
    type: typeof type === "string" ? type : undefined,
    corsairEntityId:
      typeof corsairEntityId === "string" && corsairEntityId.length > 0
        ? corsairEntityId
        : undefined,
  }
}
