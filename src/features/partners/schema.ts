import type {
  Partner as PrismaPartner,
  User as PrismaUser,
} from "@prisma/client";
import { z } from "zod";

/**
 * Partner = User (공통 정보) + Partner (설계사 추가 정보) 의 조인 뷰.
 *
 * 가입자 노출: user.name, avatarUrl, bio, yearsOfExperience, trustMetric
 * 매칭 사용 : exposureCount, recentSubmissions
 * 운영 사용 : user.email (로그인), user.phone (알림톡), active, licenseNumber
 *
 * Prisma 모델은 1:1 분리 (PK 공유) — 타입은 query 가 include 로 묶어서 노출.
 * 도메인 코드는 항상 이 결합형을 사용 (raw Prisma 모델 노출 X).
 */
export type Partner = PrismaPartner & {
  user: Pick<PrismaUser, "id" | "email" | "name" | "phone">;
};

/**
 * 어드민 등록/수정 폼 입력.
 * - User 필드 (name/email/phone) + Partner 필드 모두 포함.
 * - 시스템 카운터 (exposureCount/recentSubmissions/createdAt) 와 id/authId 제외.
 *
 * 폼 submit 시점에 이 schema 가 검증 — Prisma 도달 전 단일 진실 공급원.
 */
export const PartnerInputSchema = z.object({
  // User 필드
  name: z.string().min(1).max(20),
  email: z.email(),
  phone: z
    .string()
    .regex(/^01[0-9]{8,9}$/, "올바른 휴대폰 번호 형식이 아닙니다."),

  // Partner 필드
  avatarUrl: z.url(),
  bio: z.string().min(1).max(60, "한줄 소개는 60자 이내로 작성해주세요."),
  /** 경력 연차 — 후보 카드에 "경력 N년" 으로 노출 */
  yearsOfExperience: z.number().int().min(0).max(60),
  /** 신뢰 지표 한 줄 — 후보 카드 하단. 예: "고객 96%가 계속 함께하고 있어요" */
  trustMetric: z.string().min(1).max(40),
  /** 설계사 자격번호 — UNIQUE. 운영자가 오프라인 검증 후 등록. */
  licenseNumber: z.string().min(1, "자격번호는 필수입니다.").max(40),
  active: z.boolean(),
});

export type PartnerInput = z.infer<typeof PartnerInputSchema>;

/**
 * 가입자 카드용 슬림 뷰 — 후보 노출에서 사용.
 * 노출되어선 안 되는 운영 필드(email/phone/active/카운터/license)를 제외.
 *
 * `isNew` 는 derived — exposureCount === 0 인 신규 등록 설계사.
 */
export type PartnerCard = {
  id: string;
  name: string;          // user.name
  avatarUrl: string;
  bio: string;
  yearsOfExperience: number;
  trustMetric: string;
  isNew: boolean;
};
