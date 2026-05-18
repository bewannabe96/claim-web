import type {
  Partner as PrismaPartner,
  PartnerInvitation as PrismaPartnerInvitation,
  User as PrismaUser,
} from "@prisma/client";
import { z } from "zod";

/**
 * Partner = User (공통 정보) + Partner (설계사 추가 정보) 의 조인 뷰.
 *
 * 가입자 노출: user.name, bio, yearsOfExperience, trustMetric
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
 * 어드민 폼 입력 — 신규 가입 초청 / 등록 완료 설계사 편집 공용.
 *
 * email 은 받지 않음 — Kakao OAuth 가 가입 시점에 제공하며 어드민 측 수정 불가
 * (auth.users.email 이 진실).
 *
 * 폼 submit 시점에 이 schema 가 검증 — Prisma 도달 전 단일 진실 공급원.
 */
export const PartnerInputSchema = z.object({
  // 기본 정보
  name: z.string().min(1).max(20),
  phone: z
    .string()
    .regex(/^01[0-9]{8,9}$/, "올바른 휴대폰 번호 형식이 아닙니다."),

  // 가입자 노출용
  bio: z.string().min(1).max(60, "한줄 소개는 60자 이내로 작성해주세요."),
  /** 경력 연차 — 후보 카드에 "경력 N년" 으로 노출 */
  yearsOfExperience: z.number().int().min(0).max(60),
  /** 신뢰 지표 한 줄 — 후보 카드 하단. 예: "고객 96%가 계속 함께하고 있어요" */
  trustMetric: z.string().min(1).max(40),
  /** 설계사 자격번호 — Partner.licenseNumber UNIQUE. 운영자가 오프라인 검증 후 입력. */
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
  bio: string;
  yearsOfExperience: number;
  trustMetric: string;
  isNew: boolean;
};

/** PartnerInvitation Prisma 모델의 도메인 alias — 어드민 페이지 / 가입 페이지 공용. */
export type PartnerInvitation = PrismaPartnerInvitation;

/**
 * 가입 초청 token 유효성 검사 시점에 가입 페이지가 사용하는 슬림 뷰.
 * 보안상 token 자체는 반환에서 제외 (이미 URL 로 받은 값).
 *
 * `phoneVerifiedAt` 으로 페이지가 본인인증 단계 vs Kakao 가입 단계 분기.
 */
export type PartnerInvitationView = Pick<
  PrismaPartnerInvitation,
  "id" | "name" | "phone" | "expiresAt" | "consumedAt" | "phoneVerifiedAt"
>;

/**
 * Invitation 만료 기본값 (일 단위). env `PARTNER_INVITATION_TTL_DAYS` 로 override.
 * 발급/재발급 시 `Date.now() + TTL` 로 expiresAt 산출.
 */
export const PARTNER_INVITATION_TTL_DAYS = Number(
  process.env.PARTNER_INVITATION_TTL_DAYS ?? 7,
);
