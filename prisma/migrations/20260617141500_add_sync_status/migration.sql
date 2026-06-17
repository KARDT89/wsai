-- CreateTable
CREATE TABLE "sync_status" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plugin" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "reason" TEXT,
    "last_started_at" TIMESTAMPTZ,
    "last_synced_at" TIMESTAMPTZ,
    "last_failed_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sync_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_status_tenant_id_plugin_scope_key" ON "sync_status"("tenant_id", "plugin", "scope");

-- CreateIndex
CREATE INDEX "sync_status_tenant_id_idx" ON "sync_status"("tenant_id");

-- CreateIndex
CREATE INDEX "sync_status_plugin_idx" ON "sync_status"("plugin");

-- CreateIndex
CREATE INDEX "sync_status_status_idx" ON "sync_status"("status");

-- AddForeignKey
ALTER TABLE "sync_status" ADD CONSTRAINT "sync_status_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
