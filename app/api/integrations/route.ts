import { NextResponse } from "next/server"

import {
  ensureCorsairSetup,
  getCorsairCredentials,
  getMissingCredentialLabels,
} from "@/lib/corsair/server"
import { prisma } from "@/lib/db"
import { integrationDefinitions } from "@/lib/integrations"
import { getCurrentSession } from "@/lib/session"

export async function GET() {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await ensureCorsairSetup(session.user.id)
    const accountStatus = await getAccountStatus(session.user.id)
    const counts = await getEntityCounts(session.user.id)

    return NextResponse.json({
      integrations: integrationDefinitions.map((integration) => {
        const missingCredentials = hasIntegrationCredentials(integration.id)
          ? []
          : getMissingCredentialLabels(integration.id)

        return {
          ...integration,
          status:
            missingCredentials.length > 0
              ? "missing_credentials"
              : accountStatus[integration.id]
                ? "connected"
                : "not_connected",
          entityCount: counts[integration.id] ?? 0,
          missingCredentials,
        }
      }),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load integrations.",
      },
      { status: 500 }
    )
  }
}

async function getEntityCounts(tenantId: string) {
  const rows = await prisma.corsairEntity.groupBy({
    by: ["accountId"],
    where: {
      account: {
        tenantId,
      },
    },
    _count: {
      id: true,
    },
  })

  const accounts = await prisma.corsairAccount.findMany({
    where: {
      tenantId,
    },
    select: {
      id: true,
      integration: {
        select: {
          name: true,
        },
      },
    },
  })

  const integrationByAccount = new Map(
    accounts.map((account) => [account.id, account.integration.name])
  )
  const counts: Record<string, number> = {}

  for (const row of rows) {
    const integrationName = integrationByAccount.get(row.accountId)
    if (integrationName) {
      counts[integrationName] = (counts[integrationName] ?? 0) + row._count.id
    }
  }

  return counts
}

async function getAccountStatus(tenantId: string) {
  const accounts = await prisma.corsairAccount.findMany({
    where: {
      tenantId,
    },
    select: {
      config: true,
      integration: {
        select: {
          name: true,
        },
      },
    },
  })
  const status: Record<string, boolean> = {}

  for (const account of accounts) {
    status[account.integration.name] = hasEncryptedAccountConfig(account.config)
  }

  return status
}

function hasEncryptedAccountConfig(config: unknown) {
  return (
    config !== null &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    Object.keys(config).length > 0
  )
}

function hasIntegrationCredentials(pluginId: string) {
  const credentials = getCorsairCredentials()

  if (pluginId === "gmail" || pluginId === "googlecalendar") {
    return Boolean(credentials[pluginId])
  }

  return true
}
