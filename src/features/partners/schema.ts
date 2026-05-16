import type { Partner as PrismaPartner } from "@prisma/client";
import { z } from "zod";

/**
 * Partner — 풀에 등록된 보험 설계사.
 *
 * 가입자 노출: avatarUrl, name, bio, yearsOfExperience, trustMetric
 * 매칭 사용 : exposureCount (형평성), recentSubmissions (페널티)
 * 운영 사용 : phone (알림톡), email (로그인), active
 *
 * 타입은 Prisma 가 DB schema 에서 derive — single source of truth.
 * features 경유 import 일관성을 위해 여기서 re-export.
 *
 * NOTE: 과거에 있던 `specialties` (전문 보험 카테고리) 는 도메인에서 제거.
 * 매칭은 활성 + 노출 적은 순으로 단순화. 추후 재도입 시 schema + findMatchCandidates +
 * 카드 UI 만 복구하면 됨.
 */
export type Partner = PrismaPartner;

/**
 * 어드민 등록/수정 폼 입력. id / 시점 컬럼 / 시스템 카운터 제외.
 * 폼 submit 시점에 이 schema 가 검증 — Prisma 도달 전 단일 진실 공급원.
 */
export const PartnerInputSchema = z.object({
  name: z.string().min(1).max(20),
  avatarUrl: z.url(),
  bio: z.string().min(1).max(60, "한줄 소개는 60자 이내로 작성해주세요."),
  /** 경력 연차 — 후보 카드에 "경력 N년" 으로 노출 */
  yearsOfExperience: z.number().int().min(0).max(60),
  /** 신뢰 지표 한 줄 — 후보 카드 하단. 예: "고객 96%가 계속 함께하고 있어요" */
  trustMetric: z.string().min(1).max(40),
  phone: z
    .string()
    .regex(/^01[0-9]{8,9}$/, "올바른 휴대폰 번호 형식이 아닙니다."),
  email: z.email(),
  active: z.boolean(),
});

export type PartnerInput = z.infer<typeof PartnerInputSchema>;

/**
 * 가입자 카드용 슬림 뷰 — 후보 노출에서 사용.
 * 노출되어선 안 되는 운영 필드(phone/email/active/카운터)를 제외.
 *
 * `isNew` 는 derived — exposureCount === 0 인 신규 등록 설계사.
 */
export type PartnerCard = Pick<
  Partner,
  | "id"
  | "name"
  | "avatarUrl"
  | "bio"
  | "yearsOfExperience"
  | "trustMetric"
> & { isNew: boolean };
