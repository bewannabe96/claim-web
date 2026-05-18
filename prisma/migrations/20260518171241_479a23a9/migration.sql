/*
  Warnings:

  - You are about to drop the column `avatar_url` on the `partner` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `user` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[phone]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "user_role_idx";

-- AlterTable
ALTER TABLE "partner" DROP COLUMN "avatar_url";

-- AlterTable
ALTER TABLE "user" DROP COLUMN "role";

-- CreateTable
CREATE TABLE "partner_invitation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "years_of_experience" INTEGER NOT NULL,
    "trust_metric" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "phone_verified_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "consumed_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_invitation_token_key" ON "partner_invitation"("token");

-- CreateIndex
CREATE INDEX "partner_invitation_consumed_at_created_at_idx" ON "partner_invitation"("consumed_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "partner_invitation_phone_idx" ON "partner_invitation"("phone");

-- CreateIndex
CREATE INDEX "partner_invitation_license_number_idx" ON "partner_invitation"("license_number");

-- Backfill: NULL/빈 phone 을 'temp-<id>' 로 채워 UNIQUE 충돌 방지 (기존 실데이터는 보존)
UPDATE "user" SET "phone" = 'temp-' || "id" WHERE "phone" IS NULL OR "phone" = '';

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");
