/**
 * 도메인 타입 — zod 에서 derive 못 하는 union literal / 라벨 매핑.
 *
 * NOTE (dormant): `INSURANCE_CATEGORIES` 와 `AGE_RANGES` 는 현 모델에서 사용처
 * 0건이지만 정의는 보존. 추후 재도입 (전문 분야 부활, 연령대 chip 등) 시
 * 즉시 import 만 살리면 됨. dead code 가 아닌 의도된 cold storage.
 */

export type InsuranceCategory =
  | "life"
  | "health"
  | "auto"
  | "fire"
  | "pension"
  | "child";

export const INSURANCE_CATEGORIES = [
  "life",
  "health",
  "auto",
  "fire",
  "pension",
  "child",
] as const satisfies readonly InsuranceCategory[];

export const INSURANCE_CATEGORY_LABEL: Record<InsuranceCategory, string> = {
  life: "생명보험",
  health: "건강보험",
  auto: "자동차보험",
  fire: "화재보험",
  pension: "연금보험",
  child: "어린이보험",
};

export type AgeRange = "20s" | "30s" | "40s" | "50s" | "60s+";

export const AGE_RANGES = [
  "20s",
  "30s",
  "40s",
  "50s",
  "60s+",
] as const satisfies readonly AgeRange[];

export const AGE_RANGE_LABEL: Record<AgeRange, string> = {
  "20s": "20대",
  "30s": "30대",
  "40s": "40대",
  "50s": "50대",
  "60s+": "60대 이상",
};

export type Gender = "male" | "female";

export const GENDER_LABEL: Record<Gender, string> = {
  male: "남성",
  female: "여성",
};

export const KOREAN_REGIONS = [
  "서울",
  "경기",
  "인천",
  "강원",
  "대전",
  "세종",
  "충남",
  "충북",
  "광주",
  "전남",
  "전북",
  "대구",
  "경북",
  "부산",
  "울산",
  "경남",
  "제주",
] as const;

export type KoreanRegion = (typeof KOREAN_REGIONS)[number];
