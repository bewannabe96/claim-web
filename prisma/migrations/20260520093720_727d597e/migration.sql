-- DropIndex
DROP INDEX "partner_match_stats_exposure_count_idx";

-- AlterTable
ALTER TABLE "partner_invitation" ADD COLUMN     "existing_user_id" TEXT;

-- CreateIndex
CREATE INDEX "partner_invitation_existing_user_id_idx" ON "partner_invitation"("existing_user_id");

-- CreateIndex
CREATE INDEX "partner_match_stats_selected_count_idx" ON "partner_match_stats"("selected_count");
