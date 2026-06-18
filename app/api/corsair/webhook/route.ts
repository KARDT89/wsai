import { NextResponse, type NextRequest } from "next/server"

import { WEBHOOK_ENDPOINT } from "@/app/api/webhooks/webhook-handler"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      deprecated: true,
      endpoint: "/api/corsair/webhook",
      replacement: WEBHOOK_ENDPOINT,
      expectedUrl: WEBHOOK_ENDPOINT,
    },
    { status: 410 }
  )
}

export async function POST(request: NextRequest) {
  const replacement = new URL(WEBHOOK_ENDPOINT, request.url)
  replacement.search = request.nextUrl.search

  return NextResponse.redirect(replacement, 308)
}
