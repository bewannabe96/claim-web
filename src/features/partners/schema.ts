import type {
  Partner as PrismaPartner,
  PartnerSignupInvitation as PrismaPartnerSignupInvitation,
  PartnerAssignmentStats as PrismaPartnerAssignmentStats,
  User as PrismaUser,
} from "@prisma/client";
import { z } from "zod";

/**
 * Partner = User (공통 정보) + Partner (설계사 추가 정보) + 배정 카운터 (1:1) 의 조인 뷰.
 *
 * 가입자 노출: user.name, bio, yearsOfExperience, trustMetric
 * 후보 산출 사용 : assignmentStats.selectedCount (정렬 키), assignmentStats.exposureCount (isNew 판정)
 * 운영 사용 : user.email (로그인), user.phone (알림톡), active, licenseNumber
 *
 * Prisma 모델은 1:1 분리 (PK 공유) — 타입은 query 가 include 로 묶어서 노출.
 * 도메인 코드는 항상 이 결합형을 사용 (raw Prisma 모델 노출 X).
 *
 * `assignmentStats` 는 가입 트랜잭션 + 시더 백필이 eager-create 하므로 정상 흐름에서
 * non-null. 그러나 Prisma 의 1:1 optional 관계 타입은 항상 nullable — 호출자는
 * `?? 0` 폴백으로 레거시 partner 를 안전하게 처리.
 */
export type Partner = PrismaPartner & {
  user: Pick<PrismaUser, "id" | "email" | "name" | "phone">;
  assignmentStats: PrismaPartnerAssignmentStats | null;
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
 * `isNew` 는 derived — assignmentStats.exposureCount === 0 인 신규 등록 설계사.
 */
export type PartnerCard = {
  id: string;
  name: string;          // user.name
  bio: string;
  yearsOfExperience: number;
  trustMetric: string;
  isNew: boolean;
};

/** PartnerSignupInvitation Prisma 모델의 도메인 alias — 어드민 페이지 / 가입 페이지 공용. */
export type PartnerSignupInvitation = PrismaPartnerSignupInvitation;

/**
 * 가입 초청 token 유효성 검사 시점에 가입 페이지가 사용하는 슬림 뷰.
 * 보안상 token 자체는 반환에서 제외 (이미 URL 로 받은 값).
 *
 * `linkedAuthId` 는 verify 페이지의 게이트 (현재 Kakao 세션 == 최신 lock 인지)
 * 에만 사용. signup 페이지는 항상 Step 1 부터 시작 — 매 진입마다 새 OAuth 가
 * 이전 lock 을 덮어쓰는 모델. 본인인증 audit (`phoneVerifiedAt`) 은 view 에
 * 포함하지 않음 — 가입 직전 트랜잭션 안에서만 의미가 있음.
 */
export type PartnerSignupInvitationView = Pick<
  PrismaPartnerSignupInvitation,
  | "id"
  | "name"
  | "phone"
  | "expiresAt"
  | "consumedAt"
  | "linkedAuthId"
  | "existingUserId"
>;

/**
 * Invitation 만료 기본값 (일 단위). env `PARTNER_INVITATION_TTL_DAYS` 로 override.
 * 발급/재발급 시 `Date.now() + TTL` 로 expiresAt 산출.
 */
export const PARTNER_INVITATION_TTL_DAYS = Number(
  process.env.PARTNER_INVITATION_TTL_DAYS ?? 7,
);
