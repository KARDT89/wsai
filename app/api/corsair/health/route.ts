import { NextResponse } from "next/server"

import { getAppUrl, getCorsairWebhookUrl } from "@/lib/corsair/server"
import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

export const runtime = "nodejs"

export async function GET() {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.id
  const appUrl = getAppUrl()
  const webhookUrl = getCorsairWebhookUrl(tenantId)

  const [accounts, syncStatuses, webhookEvents] = await Promise.all([
    prisma.corsairAccount.findMany({
      where: { tenantId },
      select: {
        updatedAt: true,
        dek: true,
        integration: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.syncStatus.findMany({
      where: { tenantId },
      select: {
        plugin: true,
        scope: true,
        status: true,
        reason: true,
        lastStartedAt: true,
        lastSyncedAt: true,
        lastFailedAt: true,
        lastError: true,
        itemCount: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.corsairEvent.findMany({
      where: {
        account: { tenantId },
        eventType: { contains: "webhook" },
      },
      select: {
        eventType: true,
        status: true,
        updatedAt: true,
        account: {
          select: {
            integration: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ])

  return NextResponse.json({
    ok: true,
    tenantId,
    appUrl,
    corsairWebhookUrl: process.env.CORSAIR_WEBHOOK_URL ?? null,
    expectedWebhookUrl: webhookUrl,
    webhookTenantResolution:
      "Gmail resolves from Pub/Sub emailAddress; Calendar resolves from the stored x-goog-channel-id mapping. Optional ?tenantId= remains for manual tests.",
    inlineFallback:
      process.env.CORSAIR_SYNC_INLINE_FALLBACK ??
      (process.env.NODE_ENV !== "production" ? "true" : "false"),
    connectedIntegrations: accounts.map((account) => ({
      plugin: account.integration.name,
      connected: Boolean(account.dek),
      updatedAt: account.updatedAt.toISOString(),
    })),
    syncStatuses: syncStatuses.map((status) => ({
      plugin: status.plugin,
      scope: status.scope,
      status: status.status,
      reason: status.reason,
      lastStartedAt: status.lastStartedAt?.toISOString() ?? null,
      lastSyncedAt: status.lastSyncedAt?.toISOString() ?? null,
      lastFailedAt: status.lastFailedAt?.toISOString() ?? null,
      lastError: status.lastError,
      itemCount: status.itemCount,
      updatedAt: status.updatedAt.toISOString(),
    })),
    recentWebhookEvents: webhookEvents.map((event) => ({
      plugin: event.account.integration.name,
      eventType: event.eventType,
      status: event.status,
      updatedAt: event.updatedAt.toISOString(),
    })),
  })
}
