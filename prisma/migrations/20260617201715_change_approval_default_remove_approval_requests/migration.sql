/*
  Warnings:

  - You are about to drop the `approval_requests` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_userId_fkey";

-- AlterTable
ALTER TABLE "user_settings" ALTER COLUMN "approvalStrict" SET DEFAULT 'writes';

-- DropTable
DROP TABLE "approval_requests";
