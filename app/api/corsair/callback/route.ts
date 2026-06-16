import { processOAuthCallback } from "corsair/oauth"
import { NextResponse, type NextRequest } from "next/server"

import {
  ensureCorsairSetup,
  getCorsairInstance,
  getCorsairRedirectUri,
  isKnownCorsairPlugin,
} from "@/lib/corsair/server"
import { isSyncableCorsairPlugin } from "@/lib/corsair/sync"
import { enqueueCorsairSync } from "@/inngest/events"

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error")

  if (error) {
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(error)}`, request.url)
    )
  }

  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/integrations?error=missing-oauth-code", request.url)
    )
  }

  try {
    const result = await processOAuthCallback(getCorsairInstance(), {
      code,
      state,
      redirectUri: getCorsairRedirectUri(),
    })

    await ensureCorsairSetup(result.tenantId)

    if (isKnownCorsairPlugin(result.plugin) && isSyncableCorsairPlugin(result.plugin)) {
      await enqueueCorsairSync({
        tenantId: result.tenantId,
        plugin: result.plugin,
        reason: "oauth_callback",
      })
    }

    return NextResponse.redirect(
      new URL(`/integrations?connected=${result.plugin}`, request.url)
    )
  } catch (callbackError) {
    const message = encodeURIComponent(
      callbackError instanceof Error
        ? callbackError.message
        : "Unable to complete OAuth."
    )

    return NextResponse.redirect(
      new URL(`/integrations?error=${message}`, request.url)
    )
  }
}
