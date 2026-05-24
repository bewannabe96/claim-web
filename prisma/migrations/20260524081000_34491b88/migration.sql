-- AlterTable
ALTER TABLE "plan_proposal" ADD COLUMN     "analysis_skipped_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "plan_request" ADD COLUMN     "external_proposal_keys" TEXT[] DEFAULT ARRAY[]::TEXT[];
