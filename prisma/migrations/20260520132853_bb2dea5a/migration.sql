/*
  Warnings:

  - You are about to drop the `match_assignment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `partner_invitation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `partner_match_stats` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `plan_request_candidate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `proposal` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `proposal_analysis_report` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "match_assignment" DROP CONSTRAINT "match_assignment_partner_id_fkey";

-- DropForeignKey
ALTER TABLE "match_assignment" DROP CONSTRAINT "match_assignment_request_id_fkey";

-- DropForeignKey
ALTER TABLE "partner_match_stats" DROP CONSTRAINT "partner_match_stats_partner_id_fkey";

-- DropForeignKey
ALTER TABLE "plan_request_candidate" DROP CONSTRAINT "plan_request_candidate_partner_id_fkey";

-- DropForeignKey
ALTER TABLE "plan_request_candidate" DROP CONSTRAINT "plan_request_candidate_request_id_fkey";

-- DropForeignKey
ALTER TABLE "proposal" DROP CONSTRAINT "proposal_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "proposal_analysis_report" DROP CONSTRAINT "proposal_analysis_report_proposal_id_fkey";

-- DropTable
DROP TABLE "match_assignment";

-- DropTable
DROP TABLE "partner_invitation";

-- DropTable
DROP TABLE "partner_match_stats";

-- DropTable
DROP TABLE "plan_request_candidate";

-- DropTable
DROP TABLE "proposal";

-- DropTable
DROP TABLE "proposal_analysis_report";

-- CreateTable
CREATE TABLE "plan_request_assignment_candidate" (
    "request_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "candidate_rank" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_request_assignment_candidate_pkey" PRIMARY KEY ("request_id","partner_id")
);

-- CreateTable
CREATE TABLE "partner_assignment_stats" (
    "partner_id" TEXT NOT NULL,
    "exposure_count" INTEGER NOT NULL DEFAULT 0,
    "selected_count" INTEGER NOT NULL DEFAULT 0,
    "contacted_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_assignment_stats_pkey" PRIMARY KEY ("partner_id")
);

-- CreateTable
CREATE TABLE "partner_signup_invitation" (
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
    "linked_auth_id" UUID,
    "phone_verified_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "consumed_user_id" TEXT,
    "existing_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_signup_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_request_assignment" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),

    CONSTRAINT "plan_request_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_proposal" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "pdf_s3_key" TEXT NOT NULL,
    "pdf_size_bytes" BIGINT,
    "pdf_hash" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzed_at" TIMESTAMPTZ(6),
    "analysis_error" JSONB,
    "analysis_error_at" TIMESTAMPTZ(6),
    "contacted_at" TIMESTAMPTZ(6),

    CONSTRAINT "plan_proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_proposal_analysis_report" (
    "proposal_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "report" JSONB NOT NULL,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_proposal_analysis_report_pkey" PRIMARY KEY ("proposal_id")
);

-- CreateIndex
CREATE INDEX "plan_request_assignment_candidate_request_id_idx" ON "plan_request_assignment_candidate"("request_id");

-- CreateIndex
CREATE INDEX "plan_request_assignment_candidate_partner_id_idx" ON "plan_request_assignment_candidate"("partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_request_assignment_candidate_request_id_candidate_rank_key" ON "plan_request_assignment_candidate"("request_id", "candidate_rank");

-- CreateIndex
CREATE INDEX "partner_assignment_stats_selected_count_idx" ON "partner_assignment_stats"("selected_count");

-- CreateIndex
CREATE UNIQUE INDEX "partner_signup_invitation_token_key" ON "partner_signup_invitation"("token");

-- CreateIndex
CREATE INDEX "partner_signup_invitation_consumed_at_created_at_idx" ON "partner_signup_invitation"("consumed_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "partner_signup_invitation_phone_idx" ON "partner_signup_invitation"("phone");

-- CreateIndex
CREATE INDEX "partner_signup_invitation_license_number_idx" ON "partner_signup_invitation"("license_number");

-- CreateIndex
CREATE INDEX "partner_signup_invitation_linked_auth_id_idx" ON "partner_signup_invitation"("linked_auth_id");

-- CreateIndex
CREATE INDEX "partner_signup_invitation_existing_user_id_idx" ON "partner_signup_invitation"("existing_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_request_assignment_token_key" ON "plan_request_assignment"("token");

-- CreateIndex
CREATE INDEX "plan_request_assignment_request_id_idx" ON "plan_request_assignment"("request_id");

-- CreateIndex
CREATE INDEX "plan_request_assignment_partner_id_status_idx" ON "plan_request_assignment"("partner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "plan_request_assignment_request_id_partner_id_key" ON "plan_request_assignment"("request_id", "partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_proposal_assignment_id_key" ON "plan_proposal"("assignment_id");

-- CreateIndex
CREATE INDEX "plan_proposal_pdf_hash_idx" ON "plan_proposal"("pdf_hash");

-- CreateIndex
CREATE INDEX "plan_proposal_analysis_error_at_idx" ON "plan_proposal"("analysis_error_at");

-- CreateIndex
CREATE INDEX "plan_proposal_analysis_report_schema_version_idx" ON "plan_proposal_analysis_report"("schema_version");

-- AddForeignKey
ALTER TABLE "plan_request_assignment_candidate" ADD CONSTRAINT "plan_request_assignment_candidate_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_request_assignment_candidate" ADD CONSTRAINT "plan_request_assignment_candidate_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_assignment_stats" ADD CONSTRAINT "partner_assignment_stats_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_request_assignment" ADD CONSTRAINT "plan_request_assignment_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_request_assignment" ADD CONSTRAINT "plan_request_assignment_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_proposal" ADD CONSTRAINT "plan_proposal_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "plan_request_assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_proposal_analysis_report" ADD CONSTRAINT "plan_proposal_analysis_report_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "plan_proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
