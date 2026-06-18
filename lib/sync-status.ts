import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/db"
import type { GmailMailbox, SyncableCorsairPluginId } from "@/lib/corsair/sync"

export type SyncScope = "all" | "webhook" | GmailMailbox

export type SyncStatusMetadata = {
  plugin: SyncableCorsairPluginId
  scope: SyncScope
  status: "idle" | "running" | "success" | "failed"
  reason: string | null
  lastStartedAt: string | null
  lastSyncedAt: string | null
  lastFailedAt: string | null
  lastError: string | null
  itemCount: number
}

type SyncStatusRow = {
  plugin: string
  scope: string
  status: string
  reason: string | null
  last_started_at: Date | null
  last_synced_at: Date | null
  last_failed_at: Date | null
  last_error: string | null
  item_count: number
}

export async function markSyncStarted({
  tenantId,
  plugin,
  scope = "all",
  reason,
}: {
  tenantId: string
  plugin: SyncableCorsairPluginId
  scope?: SyncScope
  reason?: string | null
}) {
  const id = randomUUID()

  try {
    await prisma.$executeRaw`
      INSERT INTO sync_status (
        id,
        tenant_id,
        plugin,
        scope,
        status,
        reason,
        last_started_at,
        item_count,
        updated_at
      )
      VALUES (
        ${id},
        ${tenantId},
        ${plugin},
        ${scope},
        'running',
        ${reason ?? null},
        NOW(),
        0,
        NOW()
      )
      ON CONFLICT (tenant_id, plugin, scope)
      DO UPDATE SET
        status = 'running',
        reason = EXCLUDED.reason,
        last_started_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
    `
  } catch (error) {
    ignoreMissingSyncStatusTable(error)
  }
}

export async function markSyncSucceeded({
  tenantId,
  plugin,
  scope = "all",
  reason,
  itemCount,
}: {
  tenantId: string
  plugin: SyncableCorsairPluginId
  scope?: SyncScope
  reason?: string | null
  itemCount: number
}) {
  const id = randomUUID()

  try {
    await prisma.$executeRaw`
      INSERT INTO sync_status (
        id,
        tenant_id,
        plugin,
        scope,
        status,
        reason,
        last_synced_at,
        last_error,
        item_count,
        updated_at
      )
      VALUES (
        ${id},
        ${tenantId},
        ${plugin},
        ${scope},
        'success',
        ${reason ?? null},
        NOW(),
        NULL,
        ${itemCount},
        NOW()
      )
      ON CONFLICT (tenant_id, plugin, scope)
      DO UPDATE SET
        status = 'success',
        reason = EXCLUDED.reason,
        last_synced_at = NOW(),
        last_error = NULL,
        item_count = EXCLUDED.item_count,
        updated_at = NOW()
    `
  } catch (error) {
    ignoreMissingSyncStatusTable(error)
  }
}

export async function markSyncFailed({
  tenantId,
  plugin,
  scope = "all",
  reason,
  error,
}: {
  tenantId: string
  plugin: SyncableCorsairPluginId
  scope?: SyncScope
  reason?: string | null
  error: unknown
}) {
  const id = randomUUID()

  try {
    await prisma.$executeRaw`
      INSERT INTO sync_status (
        id,
        tenant_id,
        plugin,
        scope,
        status,
        reason,
        last_failed_at,
        last_error,
        updated_at
      )
      VALUES (
        ${id},
        ${tenantId},
        ${plugin},
        ${scope},
        'failed',
        ${reason ?? null},
        NOW(),
        ${formatSyncError(error)},
        NOW()
      )
      ON CONFLICT (tenant_id, plugin, scope)
      DO UPDATE SET
        status = 'failed',
        reason = EXCLUDED.reason,
        last_failed_at = NOW(),
        last_error = EXCLUDED.last_error,
        updated_at = NOW()
    `
  } catch (syncStatusError) {
    ignoreMissingSyncStatusTable(syncStatusError)
  }
}

export async function getSyncStatus(
  tenantId: string,
  plugin: SyncableCorsairPluginId,
  scope: SyncScope = "all"
): Promise<SyncStatusMetadata | null> {
  try {
    const rows = await prisma.$queryRaw<SyncStatusRow[]>`
      SELECT
        plugin,
        scope,
        status,
        reason,
        last_started_at,
        last_synced_at,
        last_failed_at,
        last_error,
        item_count
      FROM sync_status
      WHERE tenant_id = ${tenantId}
        AND plugin = ${plugin}
        AND scope = ${scope}
      LIMIT 1
    `

    const row = rows[0]
    return row ? mapSyncStatusRow(row) : null
  } catch (error) {
    if (isMissingSyncStatusTable(error)) return null
    throw error
  }
}

function mapSyncStatusRow(row: SyncStatusRow): SyncStatusMetadata {
  return {
    plugin: row.plugin as SyncableCorsairPluginId,
    scope: row.scope as SyncScope,
    status: normalizeSyncStatus(row.status),
    reason: row.reason,
    lastStartedAt: row.last_started_at?.toISOString() ?? null,
    lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
    lastFailedAt: row.last_failed_at?.toISOString() ?? null,
    lastError: row.last_error,
    itemCount: row.item_count,
  }
}

function normalizeSyncStatus(value: string): SyncStatusMetadata["status"] {
  if (value === "running" || value === "success" || value === "failed") {
    return value
  }

  return "idle"
}

function formatSyncError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function ignoreMissingSyncStatusTable(error: unknown) {
  if (isMissingSyncStatusTable(error)) {
    console.warn(
      "[sync-status] sync_status table is missing; apply Prisma migrations to enable sync observability."
    )
    return
  }

  throw error
}

function isMissingSyncStatusTable(error: unknown) {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error) ?? String(error)

  return (
    message.includes("sync_status") &&
    (message.includes("does not exist") ||
      message.includes("P2021") ||
      message.includes("42P01"))
  )
}
