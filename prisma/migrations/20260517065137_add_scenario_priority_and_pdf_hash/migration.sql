-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "scenario_priority" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "partner" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "plan_request" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "proposal" ADD COLUMN     "pdf_hash" TEXT;

-- CreateIndex
CREATE INDEX "proposal_pdf_hash_idx" ON "proposal"("pdf_hash");
