-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "claim";

-- CreateTable
CREATE TABLE "claim"."plan_request" (
    "id" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "monthly_budget_min" INTEGER NOT NULL,
    "monthly_budget_max" INTEGER NOT NULL,
    "coverage" JSONB NOT NULL,
    "additional_notes" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "consent_third_party" BOOLEAN NOT NULL DEFAULT false,
    "consent_messaging" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'selecting',
    "rematch_count" INTEGER NOT NULL DEFAULT 0,
    "result_token" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_at" TIMESTAMPTZ(6),
    "deadline_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim"."plan_request_medical_history" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "treatment_period" TEXT NOT NULL,
    "treatment_start_date" DATE NOT NULL,
    "hospitalization_days" INTEGER NOT NULL DEFAULT 0,
    "outpatient_visits" INTEGER NOT NULL DEFAULT 0,
    "had_surgery" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_request_medical_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim"."plan_request_candidate" (
    "request_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "candidate_rank" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_request_candidate_pkey" PRIMARY KEY ("request_id","partner_id")
);

-- CreateTable
CREATE TABLE "claim"."partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "years_of_experience" INTEGER NOT NULL,
    "trust_metric" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "exposure_count" INTEGER NOT NULL DEFAULT 0,
    "recent_submissions" BOOLEAN[] DEFAULT ARRAY[]::BOOLEAN[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim"."match_assignment" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),

    CONSTRAINT "match_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim"."proposal" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "pdf_s3_key" TEXT NOT NULL,
    "pdf_size_bytes" BIGINT,
    "pdf_hash" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzed_at" TIMESTAMPTZ(6),

    CONSTRAINT "proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim"."proposal_analysis_report" (
    "proposal_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "report" JSONB NOT NULL,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_analysis_report_pkey" PRIMARY KEY ("proposal_id")
);

-- CreateTable
CREATE TABLE "claim"."app_settings" (
    "id" TEXT NOT NULL DEFAULT 'app',
    "candidate_count" INTEGER NOT NULL DEFAULT 5,
    "select_limit" INTEGER NOT NULL DEFAULT 3,
    "submission_deadline_hours" INTEGER NOT NULL DEFAULT 48,
    "penalty_window" INTEGER NOT NULL DEFAULT 10,
    "scenario_priority" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim"."admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_request_status_created_at_idx" ON "claim"."plan_request"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "plan_request_medical_history_request_id_idx" ON "claim"."plan_request_medical_history"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_request_medical_history_request_id_position_key" ON "claim"."plan_request_medical_history"("request_id", "position");

-- CreateIndex
CREATE INDEX "plan_request_candidate_request_id_idx" ON "claim"."plan_request_candidate"("request_id");

-- CreateIndex
CREATE INDEX "plan_request_candidate_partner_id_idx" ON "claim"."plan_request_candidate"("partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_request_candidate_request_id_candidate_rank_key" ON "claim"."plan_request_candidate"("request_id", "candidate_rank");

-- CreateIndex
CREATE UNIQUE INDEX "partner_phone_key" ON "claim"."partner"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "partner_email_key" ON "claim"."partner"("email");

-- CreateIndex
CREATE INDEX "partner_active_exposure_count_idx" ON "claim"."partner"("active", "exposure_count");

-- CreateIndex
CREATE UNIQUE INDEX "match_assignment_token_key" ON "claim"."match_assignment"("token");

-- CreateIndex
CREATE INDEX "match_assignment_request_id_idx" ON "claim"."match_assignment"("request_id");

-- CreateIndex
CREATE INDEX "match_assignment_partner_id_status_idx" ON "claim"."match_assignment"("partner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "match_assignment_request_id_partner_id_key" ON "claim"."match_assignment"("request_id", "partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_assignment_id_key" ON "claim"."proposal"("assignment_id");

-- CreateIndex
CREATE INDEX "proposal_pdf_hash_idx" ON "claim"."proposal"("pdf_hash");

-- CreateIndex
CREATE INDEX "proposal_analysis_report_schema_version_idx" ON "claim"."proposal_analysis_report"("schema_version");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "claim"."admin_users"("email");

-- AddForeignKey
ALTER TABLE "claim"."plan_request_medical_history" ADD CONSTRAINT "plan_request_medical_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "claim"."plan_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim"."plan_request_candidate" ADD CONSTRAINT "plan_request_candidate_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "claim"."plan_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim"."plan_request_candidate" ADD CONSTRAINT "plan_request_candidate_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "claim"."partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim"."match_assignment" ADD CONSTRAINT "match_assignment_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "claim"."plan_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim"."match_assignment" ADD CONSTRAINT "match_assignment_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "claim"."partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim"."proposal" ADD CONSTRAINT "proposal_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "claim"."match_assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim"."proposal_analysis_report" ADD CONSTRAINT "proposal_analysis_report_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "claim"."proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

