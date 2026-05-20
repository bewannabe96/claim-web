-- ============================================================
-- 도메인 엔티티 rename — PR 2 (3-PR refactor 시퀀스의 두번째)
-- ============================================================
-- 자세한 결정 근거: docs/domain-glossary.md
--
-- 6개 테이블 + 모든 PK / FK constraint + 모든 index 이름을 일괄 정렬.
-- ALTER ... RENAME 만 사용 (CREATE/DROP 없음, 데이터 손실 없음).
-- 이 manual migration 은 `prisma migrate dev` 가 자동 생성하면 DROP TABLE → CREATE
-- TABLE 로 만들어 데이터를 날리므로 수동 작성. PR label: `manual-migration`.
-- ============================================================

-- ┌──────────────────────────────────────────────────────────┐
-- │ 1. plan_request_candidate → plan_request_assignment_candidate │
-- └──────────────────────────────────────────────────────────┘
ALTER TABLE "claim"."plan_request_candidate" RENAME TO "plan_request_assignment_candidate";

ALTER TABLE "claim"."plan_request_assignment_candidate" RENAME CONSTRAINT "plan_request_candidate_pkey" TO "plan_request_assignment_candidate_pkey";
ALTER TABLE "claim"."plan_request_assignment_candidate" RENAME CONSTRAINT "plan_request_candidate_partner_id_fkey" TO "plan_request_assignment_candidate_partner_id_fkey";
ALTER TABLE "claim"."plan_request_assignment_candidate" RENAME CONSTRAINT "plan_request_candidate_request_id_fkey" TO "plan_request_assignment_candidate_request_id_fkey";

ALTER INDEX "claim"."plan_request_candidate_partner_id_idx" RENAME TO "plan_request_assignment_candidate_partner_id_idx";
ALTER INDEX "claim"."plan_request_candidate_request_id_idx" RENAME TO "plan_request_assignment_candidate_request_id_idx";
ALTER INDEX "claim"."plan_request_candidate_request_id_candidate_rank_key" RENAME TO "plan_request_assignment_candidate_request_id_candidate_rank_key";

-- ┌──────────────────────────────────────────────────────────┐
-- │ 2. match_assignment → plan_request_assignment             │
-- └──────────────────────────────────────────────────────────┘
ALTER TABLE "claim"."match_assignment" RENAME TO "plan_request_assignment";

ALTER TABLE "claim"."plan_request_assignment" RENAME CONSTRAINT "match_assignment_pkey" TO "plan_request_assignment_pkey";
ALTER TABLE "claim"."plan_request_assignment" RENAME CONSTRAINT "match_assignment_partner_id_fkey" TO "plan_request_assignment_partner_id_fkey";
ALTER TABLE "claim"."plan_request_assignment" RENAME CONSTRAINT "match_assignment_request_id_fkey" TO "plan_request_assignment_request_id_fkey";

ALTER INDEX "claim"."match_assignment_partner_id_status_idx" RENAME TO "plan_request_assignment_partner_id_status_idx";
ALTER INDEX "claim"."match_assignment_request_id_idx" RENAME TO "plan_request_assignment_request_id_idx";
ALTER INDEX "claim"."match_assignment_request_id_partner_id_key" RENAME TO "plan_request_assignment_request_id_partner_id_key";
ALTER INDEX "claim"."match_assignment_token_key" RENAME TO "plan_request_assignment_token_key";

-- ┌──────────────────────────────────────────────────────────┐
-- │ 3. proposal → plan_proposal                                │
-- └──────────────────────────────────────────────────────────┘
ALTER TABLE "claim"."proposal" RENAME TO "plan_proposal";

ALTER TABLE "claim"."plan_proposal" RENAME CONSTRAINT "proposal_pkey" TO "plan_proposal_pkey";
ALTER TABLE "claim"."plan_proposal" RENAME CONSTRAINT "proposal_assignment_id_fkey" TO "plan_proposal_assignment_id_fkey";

ALTER INDEX "claim"."proposal_analysis_error_at_idx" RENAME TO "plan_proposal_analysis_error_at_idx";
ALTER INDEX "claim"."proposal_assignment_id_key" RENAME TO "plan_proposal_assignment_id_key";
ALTER INDEX "claim"."proposal_pdf_hash_idx" RENAME TO "plan_proposal_pdf_hash_idx";

-- ┌──────────────────────────────────────────────────────────┐
-- │ 4. proposal_analysis_report → plan_proposal_analysis_report │
-- └──────────────────────────────────────────────────────────┘
ALTER TABLE "claim"."proposal_analysis_report" RENAME TO "plan_proposal_analysis_report";

ALTER TABLE "claim"."plan_proposal_analysis_report" RENAME CONSTRAINT "proposal_analysis_report_pkey" TO "plan_proposal_analysis_report_pkey";
ALTER TABLE "claim"."plan_proposal_analysis_report" RENAME CONSTRAINT "proposal_analysis_report_proposal_id_fkey" TO "plan_proposal_analysis_report_proposal_id_fkey";

ALTER INDEX "claim"."proposal_analysis_report_schema_version_idx" RENAME TO "plan_proposal_analysis_report_schema_version_idx";

-- ┌──────────────────────────────────────────────────────────┐
-- │ 5. partner_invitation → partner_signup_invitation          │
-- └──────────────────────────────────────────────────────────┘
ALTER TABLE "claim"."partner_invitation" RENAME TO "partner_signup_invitation";

ALTER TABLE "claim"."partner_signup_invitation" RENAME CONSTRAINT "partner_invitation_pkey" TO "partner_signup_invitation_pkey";

ALTER INDEX "claim"."partner_invitation_consumed_at_created_at_idx" RENAME TO "partner_signup_invitation_consumed_at_created_at_idx";
ALTER INDEX "claim"."partner_invitation_existing_user_id_idx" RENAME TO "partner_signup_invitation_existing_user_id_idx";
ALTER INDEX "claim"."partner_invitation_license_number_idx" RENAME TO "partner_signup_invitation_license_number_idx";
ALTER INDEX "claim"."partner_invitation_linked_auth_id_idx" RENAME TO "partner_signup_invitation_linked_auth_id_idx";
ALTER INDEX "claim"."partner_invitation_phone_idx" RENAME TO "partner_signup_invitation_phone_idx";
ALTER INDEX "claim"."partner_invitation_token_key" RENAME TO "partner_signup_invitation_token_key";

-- ┌──────────────────────────────────────────────────────────┐
-- │ 6. partner_match_stats → partner_assignment_stats          │
-- └──────────────────────────────────────────────────────────┘
ALTER TABLE "claim"."partner_match_stats" RENAME TO "partner_assignment_stats";

ALTER TABLE "claim"."partner_assignment_stats" RENAME CONSTRAINT "partner_match_stats_pkey" TO "partner_assignment_stats_pkey";
ALTER TABLE "claim"."partner_assignment_stats" RENAME CONSTRAINT "partner_match_stats_partner_id_fkey" TO "partner_assignment_stats_partner_id_fkey";

ALTER INDEX "claim"."partner_match_stats_selected_count_idx" RENAME TO "partner_assignment_stats_selected_count_idx";
