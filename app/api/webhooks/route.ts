import { type NextRequest } from "next/server"

import { handleWebhook, WEBHOOK_ENDPOINT } from "./webhook-handler"

export const runtime = "nodejs"

export async function GET() {
  return Response.json({
    ok: true,
    endpoint: WEBHOOK_ENDPOINT,
    expectedUrl: WEBHOOK_ENDPOINT,
    tenantResolution:
      "Optional ?tenantId= is supported for manual tests. Production Gmail resolves by Pub/Sub emailAddress; Calendar resolves by stored x-goog-channel-id mapping.",
  })
}

export async function POST(request: NextRequest) {
  return handleWebhook(request)
}
