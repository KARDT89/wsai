# Corsair Live Webhooks

Local live updates use a public ngrok URL that points to the Next.js dev server.

## Local Setup

1. Start the app:

```bash
pnpm dev
```

2. Start ngrok against the same port:

```bash
ngrok http 3000
```

3. Set the HTTPS forwarding URL:

```bash
CORSAIR_WEBHOOK_URL=https://your-ngrok-host.ngrok-free.app
```

4. Restart `pnpm dev`, then reconnect Gmail and Google Calendar from `/integrations`.

5. Open the health endpoint while signed in:

```text
/api/corsair/health
```

The `expectedWebhookUrl` value is the canonical bare webhook URL:

```text
https://your-ngrok-host.ngrok-free.app/api/webhooks
```

Use that full URL when configuring Google/Corsair webhook watches.

`/api/webhooks` resolves the tenant before calling Corsair's `processWebhook`.
For Gmail Pub/Sub notifications, it decodes `message.data`, reads
`emailAddress`, and matches that to the connected WSAI user. For Google
Calendar notifications, it uses `x-goog-channel-id` and the stored webhook
channel mapping created when Calendar is connected/backfilled. Optional
`?tenantId=` still works for manual local tests.

Gmail Pub/Sub notifications sent to `/api/webhooks` are routed by Corsair's
Gmail webhook matcher and trigger the Gmail sync path through webhook hooks.

## Verification

- Send a new email to the connected Gmail account.
- Confirm `/api/corsair/health` shows a recent webhook event or webhook sync status.
- Keep `/mail` open and confirm the message appears without a full browser reload.
- Create, update, or delete a Calendar event and confirm `/calendar` refreshes without reload.
- App writes and AI writes should trigger the same affected-plugin sync path.

In local development, `CORSAIR_SYNC_INLINE_FALLBACK` defaults to `true`, so live sync still runs when an Inngest worker is not running. Set it to `false` to require the background worker.
