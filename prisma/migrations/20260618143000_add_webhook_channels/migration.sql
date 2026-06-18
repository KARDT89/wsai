CREATE TABLE IF NOT EXISTS "webhook_channels" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "plugin" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "resource_id" TEXT,
  "external_account_id" TEXT,
  "calendar_id" TEXT,
  "expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_channels_channel_id_key"
  ON "webhook_channels"("channel_id");

CREATE INDEX IF NOT EXISTS "webhook_channels_tenant_id_idx"
  ON "webhook_channels"("tenant_id");

CREATE INDEX IF NOT EXISTS "webhook_channels_plugin_idx"
  ON "webhook_channels"("plugin");

CREATE INDEX IF NOT EXISTS "webhook_channels_channel_id_idx"
  ON "webhook_channels"("channel_id");

CREATE INDEX IF NOT EXISTS "webhook_channels_expires_at_idx"
  ON "webhook_channels"("expires_at");
