import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getCurrentSession } from "@/lib/session"

export async function GET() {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  })

  return NextResponse.json({
    settings: settings ?? {
      apiKeyProvider: null,
      apiKey: null,
      aiTone: "professional",
      approvalStrict: "writes",
      emailSignature: null,
    },
    // Mask the actual key — only expose whether one is set
    hasApiKey: Boolean(settings?.apiKey),
  })
}

export async function PUT(req: Request) {
  const session = await getCurrentSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    apiKeyProvider?: string | null
    apiKey?: string | null
    aiTone?: string
    approvalStrict?: string
    emailSignature?: string | null
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      apiKeyProvider: body.apiKeyProvider ?? null,
      apiKey: body.apiKey ?? null,
      aiTone: body.aiTone ?? "professional",
      approvalStrict: body.approvalStrict ?? "writes",
      emailSignature: body.emailSignature ?? null,
    },
    update: {
      ...(body.apiKeyProvider !== undefined && { apiKeyProvider: body.apiKeyProvider }),
      ...(body.apiKey !== undefined && { apiKey: body.apiKey }),
      ...(body.aiTone !== undefined && { aiTone: body.aiTone }),
      ...(body.approvalStrict !== undefined && { approvalStrict: body.approvalStrict }),
      ...(body.emailSignature !== undefined && { emailSignature: body.emailSignature }),
    },
  })

  return NextResponse.json({ settings, hasApiKey: Boolean(settings.apiKey) })
}
