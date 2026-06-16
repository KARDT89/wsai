import { NextResponse } from "next/server"

import {
  ensureCorsairSetup,
  getCorsairInstance,
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
    const status = await getCorsairInstance().manage.connectionStatus.get({
      tenantId: session.user.id,
    })
    const counts = await getEntityCounts(session.user.id)

    return NextResponse.json({
      integrations: integrationDefinitions.map((integration) => ({
        ...integration,
        status: status[integration.id] ?? "not_connected",
        entityCount: counts[integration.id] ?? 0,
        missingCredentials: getMissingCredentialLabels(integration.id),
      })),
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
