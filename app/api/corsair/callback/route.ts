import { processOAuthCallback } from "corsair/oauth"
import { NextResponse, type NextRequest } from "next/server"

import {
  ensureCorsairSetup,
  getCorsairInstance,
  getCorsairRedirectUri,
  isKnownCorsairPlugin,
} from "@/lib/corsair/server"
import { syncCorsairPlugin } from "@/lib/corsair/sync"

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

    let syncError: string | null = null

    if (isKnownCorsairPlugin(result.plugin)) {
      try {
        await syncCorsairPlugin(result.tenantId, result.plugin)
      } catch (error) {
        syncError =
          error instanceof Error ? error.message : "Initial sync did not complete."
      }
    }

    const redirectUrl = new URL(
      `/integrations?connected=${result.plugin}`,
      request.url
    )

    if (syncError) {
      redirectUrl.searchParams.set("sync_error", syncError)
    }

    return NextResponse.redirect(redirectUrl)
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
