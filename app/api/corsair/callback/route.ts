import { processOAuthCallback } from "corsair/oauth"
import { after, NextResponse, type NextRequest } from "next/server"

import {
  ensureCorsairSetup,
  getCorsairInstance,
  getCorsairRedirectUri,
  isKnownCorsairPlugin,
} from "@/lib/corsair/server"
import { isSyncableCorsairPlugin, syncCorsairPlugin } from "@/lib/corsair/sync"

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

    await ensureCorsairSetup(result.tenantId, true)

    if (isKnownCorsairPlugin(result.plugin) && isSyncableCorsairPlugin(result.plugin)) {
      after(() => syncCorsairPlugin(result.tenantId, result.plugin, "oauth_callback"))
    }

    const dest =
      result.plugin === "gmail"
        ? "/mail?connected=1"
        : result.plugin === "googlecalendar"
        ? "/calendar?connected=1"
        : `/integrations?connected=${result.plugin}`

    return NextResponse.redirect(new URL(dest, request.url))
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
