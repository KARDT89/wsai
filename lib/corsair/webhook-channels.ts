import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/db"

export type WebhookPlugin = "gmail" | "googlecalendar"

type WebhookChannelRow = {
  tenant_id: string
  plugin: string
  channel_id: string
  resource_id: string | null
  calendar_id: string | null
  expires_at: Date | null
}

export async function findTenantByWebhookChannel(channelId: string) {
  try {
    const rows = await prisma.$queryRaw<WebhookChannelRow[]>`
      SELECT tenant_id, plugin, channel_id, resource_id, calendar_id, expires_at
      FROM webhook_channels
      WHERE channel_id = ${channelId}
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
    `

    return rows[0]?.tenant_id ?? null
  } catch (error) {
    if (isMissingWebhookChannelsTable(error)) return null
    throw error
  }
}

export async function findActiveWebhookChannel({
  tenantId,
  plugin,
  calendarId,
}: {
  tenantId: string
  plugin: WebhookPlugin
  calendarId?: string
}) {
  try {
    const rows = await prisma.$queryRaw<WebhookChannelRow[]>`
      SELECT tenant_id, plugin, channel_id, resource_id, calendar_id, expires_at
      FROM webhook_channels
      WHERE tenant_id = ${tenantId}
        AND plugin = ${plugin}
        AND (${calendarId ?? null}::text IS NULL OR calendar_id = ${calendarId ?? null})
        AND (expires_at IS NULL OR expires_at > NOW() + INTERVAL '1 day')
      ORDER BY expires_at DESC NULLS LAST, updated_at DESC
      LIMIT 1
    `

    return rows[0] ?? null
  } catch (error) {
    if (isMissingWebhookChannelsTable(error)) return null
    throw error
  }
}

export async function recordWebhookChannel({
  tenantId,
  plugin,
  channelId,
  resourceId,
  externalAccountId,
  calendarId,
  expiresAt,
}: {
  tenantId: string
  plugin: WebhookPlugin
  channelId: string
  resourceId?: string | null
  externalAccountId?: string | null
  calendarId?: string | null
  expiresAt?: Date | null
}) {
  const id = randomUUID()

  await prisma.$executeRaw`
    INSERT INTO webhook_channels (
      id,
      tenant_id,
      plugin,
      channel_id,
      resource_id,
      external_account_id,
      calendar_id,
      expires_at,
      updated_at
    )
    VALUES (
      ${id},
      ${tenantId},
      ${plugin},
      ${channelId},
      ${resourceId ?? null},
      ${externalAccountId ?? null},
      ${calendarId ?? null},
      ${expiresAt ?? null},
      NOW()
    )
    ON CONFLICT (channel_id)
    DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      plugin = EXCLUDED.plugin,
      resource_id = EXCLUDED.resource_id,
      external_account_id = EXCLUDED.external_account_id,
      calendar_id = EXCLUDED.calendar_id,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
  `
}

function isMissingWebhookChannelsTable(error: unknown) {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error) ?? String(error)

  return (
    message.includes("webhook_channels") &&
    (message.includes("does not exist") ||
      message.includes("relation") ||
      message.includes("table"))
  )
}
