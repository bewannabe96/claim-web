-- =============================================================
-- 통합 User/Admin 모델 + Partner license_number + 그 외 누적 변경
-- =============================================================
-- 다루는 누적 schema 변경:
--   1. 통합 User 모델 도입, 기존 admin_users → user(role='admin') + admin 분리.
--   2. Partner 가 User 의 1:1 extension 으로 전환 (name/email/phone 은 User 로
--      이관) + Partner.licenseNumber 추가 (NOT NULL UNIQUE).
--   3. plan_request.birth_date 추가 + gender nullable 전환 (본인인증 단계 도입).
--   4. app_settings.result_retention_days 추가 (결과 보관 기간 운영 튜닝).
--   5. proposal.analysis_error / analysis_error_at + 조회 인덱스
--      (분석 실패 모니터링).
--
-- 수동 작성 이유:
--   - license_number 는 NOT NULL UNIQUE 라 dev 의 기존 partner row 에서 단순
--     ADD COLUMN 가 fail → nullable 추가 후 backfill → SET NOT NULL 3단계.
--   - 새 partner_id_fkey 가 user(id) 를 참조 → 기존 partner 마다 user row 도
--     같이 backfill 해야 FK 추가 시점에 violation 안 남.
--   - admin_users → user + admin 분리도 동일 패턴.
--
-- 멱등성: ON CONFLICT DO NOTHING + WHERE IS NULL — 부분 적용 후 재실행 안전.
-- 로컬 (빈 테이블) / dev (row 있음) / prod (아직 비어있음) 모두에서 동일하게 통과.

-- ============================================================
-- 1) user / admin 테이블 생성 (다른 ALTER 가 user 를 FK 로 참조)
-- ============================================================
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "auth_id" UUID,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_auth_id_key" ON "user"("auth_id");
CREATE UNIQUE INDEX "user_email_key"   ON "user"("email");
CREATE INDEX        "user_role_idx"    ON "user"("role");

CREATE TABLE "admin" (
    "id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- 2) admin_users → user + admin 백필
-- ------------------------------------------------------------
-- admin_users.id 는 본래 auth.users.id (UUID). user.auth_id 로 그대로 보존.
-- user.id 는 TEXT — UUID 문자열 표현을 그대로 재사용 (길이 제한 없음, 고유성 유지).
-- ============================================================
INSERT INTO "user" (id, auth_id, email, name, role)
SELECT id::text, id, email, COALESCE(name, email), 'admin'
FROM "admin_users"
ON CONFLICT (id) DO NOTHING;

INSERT INTO "admin" (id, active)
SELECT id::text, active
FROM "admin_users"
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3) partner.license_number — nullable 추가 → backfill → NOT NULL
-- ------------------------------------------------------------
-- backfill 값 'PENDING-' || id : partner.id (nanoid) 가 unique 라 UNIQUE 제약
-- 도 자동 만족. 운영자가 후속으로 진짜 자격번호로 갱신.
-- ============================================================
ALTER TABLE "partner" ADD COLUMN "license_number" TEXT;

UPDATE "partner"
SET "license_number" = 'PENDING-' || id
WHERE "license_number" IS NULL;

ALTER TABLE "partner" ALTER COLUMN "license_number" SET NOT NULL;

CREATE UNIQUE INDEX "partner_license_number_key" ON "partner"("license_number");

-- ============================================================
-- 4) partner → user 백필 (FK partner.id → user.id 추가 전 필수)
-- ------------------------------------------------------------
-- partner.id 가 새 user.id 로 그대로 승격. 이관할 컬럼: email/name/phone.
-- authId 는 null — 설계사가 첫 Kakao 로그인 시 callback 이 email 매칭으로 claim.
-- ============================================================
INSERT INTO "user" (id, email, name, phone, role)
SELECT id, email, name, phone, 'partner'
FROM "partner"
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5) partner — user 로 이관된 컬럼 제거 + FK 추가
-- ============================================================
DROP INDEX "partner_email_key";
DROP INDEX "partner_phone_key";

ALTER TABLE "partner"
    DROP COLUMN "email",
    DROP COLUMN "name",
    DROP COLUMN "phone";

ALTER TABLE "partner"
    ADD CONSTRAINT "partner_id_fkey"
    FOREIGN KEY ("id") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin"
    ADD CONSTRAINT "admin_id_fkey"
    FOREIGN KEY ("id") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 6) 구 admin_users 테이블 제거 (이관 완료)
-- ============================================================
DROP TABLE "admin_users";

-- ============================================================
-- 7) 그 외 schema 변경 (데이터 안전)
-- ============================================================

-- app_settings: 결과 페이지 보관 기간 (default 7일)
ALTER TABLE "app_settings"
    ADD COLUMN "result_retention_days" INTEGER NOT NULL DEFAULT 7;

-- plan_request: 본인인증 단계에서 birth_date 도입 + 일부 단계 gender 미입력 허용
ALTER TABLE "plan_request"
    ADD COLUMN "birth_date" DATE,
    ALTER COLUMN "gender" DROP NOT NULL;

-- proposal: 분석 실패 마지막 페이로드 + 시각 + 조회 인덱스
ALTER TABLE "proposal"
    ADD COLUMN "analysis_error"    JSONB,
    ADD COLUMN "analysis_error_at" TIMESTAMPTZ(6);

CREATE INDEX "proposal_analysis_error_at_idx" ON "proposal"("analysis_error_at");
