/*
  Warnings:

  - You are about to drop the column `exposure_count` on the `partner` table. All the data in the column will be lost.
  - You are about to drop the column `recent_submissions` on the `partner` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "partner_active_exposure_count_idx";

-- AlterTable
ALTER TABLE "partner" DROP COLUMN "exposure_count",
DROP COLUMN "recent_submissions";

-- AlterTable
ALTER TABLE "partner_credit_ledger" ADD COLUMN     "provider" VARCHAR(32),
ADD COLUMN     "provider_ref" TEXT;

-- AlterTable
ALTER TABLE "proposal" ADD COLUMN     "contacted_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "partner_match_stats" (
    "partner_id" TEXT NOT NULL,
    "exposure_count" INTEGER NOT NULL DEFAULT 0,
    "selected_count" INTEGER NOT NULL DEFAULT 0,
    "contacted_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_match_stats_pkey" PRIMARY KEY ("partner_id")
);

-- CreateIndex
CREATE INDEX "partner_match_stats_exposure_count_idx" ON "partner_match_stats"("exposure_count");

-- AddForeignKey
ALTER TABLE "partner_match_stats" ADD CONSTRAINT "partner_match_stats_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
