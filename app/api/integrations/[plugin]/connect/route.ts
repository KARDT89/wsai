import { generateOAuthUrl } from "corsair/oauth"
import { NextResponse, type NextRequest } from "next/server"

import {
  ensureCorsairSetup,
  getCorsairInstance,
  getCorsairRedirectUri,
  isKnownCorsairPlugin,
} from "@/lib/corsair/server"
import { getCurrentSession } from "@/lib/session"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ plugin: string }> }
) {
  const session = await getCurrentSession()

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const { plugin } = await params

  if (!isKnownCorsairPlugin(plugin)) {
    return NextResponse.redirect(
      new URL(`/integrations?error=unknown-plugin`, request.url)
    )
  }

  try {
    await ensureCorsairSetup(session.user.id)
    const { url } = await generateOAuthUrl(getCorsairInstance(), plugin, {
      tenantId: session.user.id,
      redirectUri: getCorsairRedirectUri(),
    })

    return NextResponse.redirect(url)
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Unable to start OAuth."
    )

    return NextResponse.redirect(
      new URL(`/integrations?error=${message}`, request.url)
    )
  }
}
