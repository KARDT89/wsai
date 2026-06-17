-- CreateTable
CREATE TABLE "corsair_permissions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "token" TEXT NOT NULL,
    "plugin" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "args" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TEXT NOT NULL,
    "error" TEXT,

    CONSTRAINT "corsair_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "corsair_permissions_tenant_id_idx" ON "corsair_permissions"("tenant_id");

-- CreateIndex
CREATE INDEX "corsair_permissions_status_idx" ON "corsair_permissions"("status");

-- CreateIndex
CREATE INDEX "corsair_permissions_token_idx" ON "corsair_permissions"("token");

-- AddForeignKey
ALTER TABLE "corsair_permissions" ADD CONSTRAINT "corsair_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
