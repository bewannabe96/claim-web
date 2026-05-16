-- ============================================================
-- 도메인 스키마 — DATABASE_URL 의 `?schema=claim` 으로 default search_path 가
-- claim 이 되어 모든 unqualified table 이 claim 에 생성됨. 방어적으로 schema
-- 존재 보장.
-- ============================================================
CREATE SCHEMA IF NOT EXISTS "claim";

-- CreateTable
CREATE TABLE "plan_request" (
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
CREATE TABLE "plan_request_medical_history" (
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
CREATE TABLE "plan_request_candidate" (
    "request_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "candidate_rank" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_request_candidate_pkey" PRIMARY KEY ("request_id","partner_id")
);

-- CreateTable
CREATE TABLE "partner" (
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
CREATE TABLE "match_assignment" (
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
CREATE TABLE "proposal" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "pdf_s3_key" TEXT NOT NULL,
    "pdf_size_bytes" BIGINT,
    "note" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'app',
    "candidate_count" INTEGER NOT NULL DEFAULT 5,
    "select_limit" INTEGER NOT NULL DEFAULT 3,
    "submission_deadline_hours" INTEGER NOT NULL DEFAULT 48,
    "penalty_window" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_request_status_created_at_idx" ON "plan_request"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "plan_request_medical_history_request_id_idx" ON "plan_request_medical_history"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_request_medical_history_request_id_position_key" ON "plan_request_medical_history"("request_id", "position");

-- CreateIndex
CREATE INDEX "plan_request_candidate_request_id_idx" ON "plan_request_candidate"("request_id");

-- CreateIndex
CREATE INDEX "plan_request_candidate_partner_id_idx" ON "plan_request_candidate"("partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_request_candidate_request_id_candidate_rank_key" ON "plan_request_candidate"("request_id", "candidate_rank");

-- CreateIndex
CREATE UNIQUE INDEX "partner_phone_key" ON "partner"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "partner_email_key" ON "partner"("email");

-- CreateIndex
CREATE INDEX "partner_active_exposure_count_idx" ON "partner"("active", "exposure_count");

-- CreateIndex
CREATE UNIQUE INDEX "match_assignment_token_key" ON "match_assignment"("token");

-- CreateIndex
CREATE INDEX "match_assignment_request_id_idx" ON "match_assignment"("request_id");

-- CreateIndex
CREATE INDEX "match_assignment_partner_id_status_idx" ON "match_assignment"("partner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "match_assignment_request_id_partner_id_key" ON "match_assignment"("request_id", "partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_assignment_id_key" ON "proposal"("assignment_id");

-- AddForeignKey
ALTER TABLE "plan_request_medical_history" ADD CONSTRAINT "plan_request_medical_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_request_candidate" ADD CONSTRAINT "plan_request_candidate_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_request_candidate" ADD CONSTRAINT "plan_request_candidate_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_assignment" ADD CONSTRAINT "match_assignment_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_assignment" ADD CONSTRAINT "match_assignment_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "match_assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 보강 — schema.prisma 가 표현 못하는 항목들.
--
-- 정책: DB 는 구조 무결성 (PK / FK / NOT NULL / UNIQUE) 만 책임.
-- 도메인 규칙 (singleton, race-safe 중복 차단, value 검증) 은 모두 앱 레이어.
-- 트리거 / CHECK / partial unique index 는 사용 안 함.
-- ============================================================

-- ─ 테이블 / 컬럼 주석 (운영 가독성) ───────────────────────
COMMENT ON TABLE "plan_request" IS
  '가입자 제안서 요청서. Step1 + Step3 sparse columns.';
COMMENT ON TABLE "plan_request_medical_history" IS
  '가입자 병력 (1:N). 한 요청당 최대 20건은 앱 zod 가 enforce.';
COMMENT ON TABLE "plan_request_candidate" IS
  '요청 ↔ 후보 설계사 M:N. selected=true 인 row 가 가입자가 K명 선택한 결과.';
COMMENT ON TABLE "partner" IS
  '풀에 등록된 보험 설계사. service_role 만 access (RLS deny-by-default).';
COMMENT ON TABLE "match_assignment" IS
  '요청 × 설계사 1:1 슬롯. 알림톡 URL token 으로 진입. status: pending/submitted/expired.';
COMMENT ON TABLE "proposal" IS
  '설계사 제출 제안서. assignment 와 1:1. 제출 후 수정 불가 (append-only).';
COMMENT ON TABLE "app_settings" IS
  '운영 튜닝 값 — single-row 가정 (id=app). 앱 레이어가 단일 row 만 다룸.';

COMMENT ON COLUMN "plan_request"."coverage" IS
  'CoverageRequest discriminated union (broad | focused). zod 가 정합 검증.';
COMMENT ON COLUMN "match_assignment"."token" IS
  '알림톡 진입용 일회성 토큰. nanoid(32) — 추측 불가능 entropy.';
COMMENT ON COLUMN "partner"."recent_submissions" IS
  '최근 N 건 제출 이력 (true=제출, false=미제출). 페널티 윈도우 안에서 미제출률 계산.';
COMMENT ON COLUMN "proposal"."pdf_s3_key" IS
  'S3 object key — "proposals/{assignment_id}/{nanoid}.pdf". 가입자 다운로드는 presigned GET URL.';
COMMENT ON COLUMN "proposal"."note" IS
  '설계 한줄 요약 (max 100자 — 앱 zod 검증). 가입자 결과 페이지에 verbatim 노출.';

-- ─ RLS — server-side service_role 만 access (deny-by-default) ─
-- 정책 0개 = anon/authenticated 모두 차단. Auth 도입 후 클라이언트가 직접
-- 쿼리할 일이 생기면 그때 정책 추가.
ALTER TABLE "plan_request"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_request_medical_history"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_request_candidate"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner"                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "match_assignment"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proposal"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_settings"                  ENABLE ROW LEVEL SECURITY;

-- ─ app_settings 시드 (single row, default 값으로) ─────────
-- getSettings() 의 findUniqueOrThrow 가 통과되도록.
INSERT INTO "app_settings" ("id") VALUES ('app') ON CONFLICT ("id") DO NOTHING;
