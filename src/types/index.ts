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

export const AGE_RANGES = ["20s", "30s", "40s", "50s", "60s+"] as const satisfies readonly AgeRange[];

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
