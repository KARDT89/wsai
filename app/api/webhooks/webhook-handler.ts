import { processWebhook } from "corsair"
import { type NextRequest } from "next/server"

import { getCorsairInstance } from "@/lib/corsair/server"
import { findTenantByWebhookChannel } from "@/lib/corsair/webhook-channels"
import { prisma } from "@/lib/db"
import { Prisma } from "@/generated/prisma/client"

export const WEBHOOK_ENDPOINT = "/api/webhooks"

type TenantResolution =
  | {
      tenantId: string
      source:
        | "query"
        | "gmail-email"
        | "subscription"
        | "calendar-channel"
      error?: never
    }
  | { tenantId: null; source: "missing" | "ambiguous"; error: string }

type CorsairWebhookResult = Awaited<ReturnType<typeof processWebhook>>
type JsonRecord = Record<string, unknown>

export async function handleWebhook(request: NextRequest | Request) {
  const url = new URL(request.url)
  const rawBody = await request.text()
  const body = rawBody.length > 0 ? rawBody : {}
  const bodyObject = parseWebhookBody(rawBody)
  const headers = Object.fromEntries(request.headers.entries())
  const tenantResolution = await resolveWebhookTenantId({
    url,
    headers,
    body: bodyObject,
  })

  if (!tenantResolution.tenantId) {
    return Response.json(
      { error: tenantResolution.error },
      { status: 400 }
    )
  }

  const tenant = await prisma.user.findUnique({
    where: { id: tenantResolution.tenantId },
    select: { id: true },
  })

  if (!tenant) {
    return Response.json(
      { error: "Invalid tenantId. No matching WSAI user exists." },
      { status: 404 }
    )
  }

  const query = {
    ...Object.fromEntries(url.searchParams.entries()),
    tenantId: tenantResolution.tenantId,
  }

  const result = await processWebhook(
    getCorsairInstance(),
    headers,
    body,
    query
  ).catch((error: unknown) => {
    return {
      plugin: null,
      action: null,
      body: null,
      response: {
        success: false,
        error:
          error instanceof Error ? error.message : "Unable to process webhook.",
      },
    } satisfies CorsairWebhookResult
  })

  if (result.plugin) {
    console.log(`Handled by ${result.plugin}.${result.action}`)
  }

  return toWebhookResponse(result, tenantResolution)
}

export async function resolveWebhookTenantId({
  url,
  headers,
  body,
}: {
  url: URL
  headers: Record<string, string>
  body: JsonRecord | null
}): Promise<TenantResolution> {
  const queryTenantId = url.searchParams.get("tenantId")?.trim()
  if (queryTenantId) return { tenantId: queryTenantId, source: "query" }

  const pubSubMessage = getPubSubMessage(body)
  const decodedPubSubData = decodePubSubData(pubSubMessage?.data)
  const emailAddress = getString(decodedPubSubData, "emailAddress")
  const historyId = getString(decodedPubSubData, "historyId")

  if (emailAddress && historyId) {
    const tenantId = await findTenantByGmailEmail(emailAddress)
    if (tenantId) return { tenantId, source: "gmail-email" }

    return {
      tenantId: null,
      source: "missing",
      error: `Unable to resolve Gmail webhook tenant for ${emailAddress}. Confirm the connected WSAI user email matches the Gmail account.`,
    }
  }

  const subscriptionTenantId = await findTenantFromSubscription(
    getString(body, "subscription") ?? pubSubMessage?.subscription
  )
  if (subscriptionTenantId) {
    return { tenantId: subscriptionTenantId, source: "subscription" }
  }

  const channelId =
    getHeader(headers, "x-goog-channel-id") ??
    getString(decodedPubSubData, "channelId")

  if (channelId) {
    const tenantId = await findTenantByWebhookChannel(channelId)
    if (tenantId) return { tenantId, source: "calendar-channel" }

    return {
      tenantId: null,
      source: "missing",
      error: `Unable to resolve Google Calendar webhook tenant for channel ${channelId}. Reconnect Calendar so WSAI can register and persist the webhook channel.`,
    }
  }

  return {
    tenantId: null,
    source: "missing",
    error:
      "Unable to resolve webhook tenant. Gmail webhooks must include emailAddress in Pub/Sub data; Calendar webhooks must include a known x-goog-channel-id.",
  }
}

async function findTenantByGmailEmail(emailAddress: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT u.id
    FROM "user" u
    INNER JOIN corsair_accounts ca ON ca.tenant_id = u.id
    INNER JOIN corsair_integrations ci ON ci.id = ca.integration_id
    WHERE LOWER(u.email) = LOWER(${emailAddress})
      AND ci.name = 'gmail'
      AND ca.dek IS NOT NULL
    LIMIT 2
  `

  return rows.length === 1 ? rows[0]!.id : null
}

async function findTenantFromSubscription(subscription?: string | null) {
  if (!subscription) return null

  const candidates = subscription
    .split(/[/:]/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (candidates.length === 0) return null

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT u.id
    FROM "user" u
    INNER JOIN corsair_accounts ca ON ca.tenant_id = u.id
    INNER JOIN corsair_integrations ci ON ci.id = ca.integration_id
    WHERE u.id IN (${Prisma.join(candidates)})
      AND ci.name IN ('gmail', 'googlecalendar')
      AND ca.dek IS NOT NULL
    LIMIT 2
  `

  return rows.length === 1 ? rows[0]!.id : null
}

function parseWebhookBody(rawBody: string): JsonRecord | null {
  if (!rawBody) return {}

  try {
    const parsed = JSON.parse(rawBody) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function getPubSubMessage(body: JsonRecord | null) {
  if (!body) return null
  const message = body.message
  if (!isRecord(message)) return null

  return {
    data: typeof message.data === "string" ? message.data : undefined,
    subscription:
      typeof message.subscription === "string" ? message.subscription : undefined,
  }
}

function decodePubSubData(data?: string) {
  if (!data) return null

  try {
    const decoded = Buffer.from(
      data.replaceAll("-", "+").replaceAll("_", "/"),
      "base64"
    ).toString("utf-8")
    const parsed = JSON.parse(decoded) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function getHeader(headers: Record<string, string>, name: string) {
  const lower = name.toLowerCase()
  return Object.entries(headers).find(([key]) => key.toLowerCase() === lower)?.[1]
}

function getString(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "string"
    ? value[key]
    : undefined
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function toWebhookResponse(
  result: CorsairWebhookResult,
  tenantResolution: TenantResolution
) {
  const response = result.response ?? { success: Boolean(result.plugin) }
  const responseSucceeded = response.success !== false
  const responseHeaders = new Headers({
    "content-type": "application/json",
    "x-wsai-tenant-resolution": tenantResolution.source,
  })
  const corsairResponseHeaders =
    "responseHeaders" in result ? result.responseHeaders : undefined

  if (corsairResponseHeaders) {
    for (const [key, value] of Object.entries(corsairResponseHeaders)) {
      responseHeaders.set(key, value)
    }
  }

  const status = result.plugin
    ? responseSucceeded
      ? 200
      : 500
    : response.success === false
      ? 400
      : 202

  return new Response(JSON.stringify(response), {
    status,
    headers: responseHeaders,
  })
}
