import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

type AccountPatchBody = {
  name?: string
  image?: string | null
}

type AccountDeleteBody = {
  confirmEmail?: string
}

export async function GET() {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [user, authAccounts, sessions, corsairAccounts, entityCounts, pendingApprovals] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.account.findMany({
        where: { userId: session.user.id },
        select: {
          id: true,
          providerId: true,
          accountId: true,
          scope: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.session.findMany({
        where: { userId: session.user.id },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.corsairAccount.findMany({
        where: { tenantId: session.user.id },
        select: {
          id: true,
          createdAt: true,
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
      prisma.corsairEntity.groupBy({
        by: ["accountId"],
        where: {
          account: {
            tenantId: session.user.id,
          },
        },
        _count: {
          id: true,
        },
      }),
      prisma.corsairPermission.count({
        where: {
          tenantId: session.user.id,
          status: "pending",
        },
      }),
    ])

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const countsByAccount = new Map(
    entityCounts.map((row) => [row.accountId, row._count.id])
  )

  return NextResponse.json({
    user,
    authAccounts,
    sessions: sessions.map((item) => ({
      ...item,
      current: item.id === session.session.id,
    })),
    integrations: corsairAccounts.map((account) => ({
      id: account.id,
      plugin: account.integration.name,
      connected: Boolean(account.dek),
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      cachedEntities: countsByAccount.get(account.id) ?? 0,
    })),
    security: {
      pendingApprovals,
      sessionCount: sessions.length,
      authMethodCount: authAccounts.length,
      integrationCount: corsairAccounts.filter((account) => account.dek).length,
    },
  })
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json()) as AccountPatchBody
  const name = body.name?.trim()
  const image = body.image?.trim() || null

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 })
  }

  if (image && !isHttpUrl(image)) {
    return NextResponse.json(
      { error: "Avatar URL must start with http:// or https://." },
      { status: 400 }
    )
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      image,
    },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ user })
}

export async function DELETE(request: Request) {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as AccountDeleteBody
  const confirmEmail = body.confirmEmail?.trim().toLowerCase()
  const userEmail = session.user.email.toLowerCase()

  if (confirmEmail !== userEmail) {
    return NextResponse.json(
      { error: "Type your account email to confirm deletion." },
      { status: 400 }
    )
  }

  await prisma.user.delete({
    where: { id: session.user.id },
  })

  return NextResponse.json({ deleted: true })
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
