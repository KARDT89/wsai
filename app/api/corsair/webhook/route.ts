import { processWebhook } from "corsair"
import { NextResponse, type NextRequest } from "next/server"

import { getCorsairInstance } from "@/lib/corsair/server"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/corsair/webhook",
  })
}

export async function POST(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId")

  if (!tenantId) {
    return NextResponse.json(
      {
        error:
          "Missing tenantId. Send Corsair webhooks to /api/corsair/webhook?tenantId=<better-auth-user-id>.",
      },
      { status: 400 }
    )
  }

  const rawBody = await request.text()
  const body = rawBody.length > 0 ? rawBody : {}
  const headers = Object.fromEntries(request.headers.entries())
  const query = Object.fromEntries(request.nextUrl.searchParams.entries())
  const result = await processWebhook(getCorsairInstance(), headers, body, query)

  const response = result.response ?? { success: Boolean(result.plugin) }
  const responseHeaders = new Headers({
    "content-type": "application/json",
  })

  if (result.responseHeaders) {
    for (const [key, value] of Object.entries(result.responseHeaders)) {
      responseHeaders.set(key, value)
    }
  }

  return new NextResponse(JSON.stringify(response), {
    status: result.plugin ? 200 : 202,
    headers: responseHeaders,
  })
}
