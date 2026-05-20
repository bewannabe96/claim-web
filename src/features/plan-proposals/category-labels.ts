/* ============================================================
 * 카테고리 한글 라벨 — eightytwo_judge 의 category_payouts.category 값을 가입자에게
 * 보여줄 한글로 매핑.
 *
 * 출처: 분석 리포트 샘플의 24개 카테고리. 외부 schema 가 새 카테고리를 도입하면
 * 여기 추가. 매핑 없는 카테고리는 raw key 로 fallback (`labelForCategory`).
 *
 * `KNOWN_CATEGORIES` 는 admin 우선순위 편집 화면의 후보 리스트로도 사용.
 * (현재는 정적 — 새 카테고리는 외부 schema 갱신 시 같이 들어옴.)
 * ============================================================ */

export const CATEGORY_LABEL = {
  // 암 (11)
  lung_cancer: "폐암",
  stomach_cancer: "위암",
  colorectal_cancer: "대장암",
  liver_cancer: "간암",
  pancreatic_cancer: "췌장암",
  breast_cancer: "유방암",
  uterine_cancer: "자궁암",
  ovarian_cancer: "난소암",
  prostate_cancer: "전립선암",
  thyroid_cancer: "갑상선암",
  leukemia: "백혈병",
  // 유사암 (2)
  carcinoma_in_situ: "제자리암",
  borderline_tumor: "경계성종양",
  // 뇌혈관 (6)
  brain_hemorrhage: "뇌출혈",
  cerebral_infraction: "뇌경색",
  cerebrovascular_disease: "뇌혈관질환",
  sequelae_of_cerebrovascular_disease: "뇌혈관질환 후유증",
  carotid_artery_stenosis: "경동맥협착증",
  cerebral_artery_stenosis: "뇌동맥협착증",
  // 심혈관 (5)
  myocardial_infarction: "심근경색",
  myocardial_infarction_complications: "심근경색 합병증",
  acute_ischemic_heart_disease: "급성 허혈성심장질환",
  chronic_ischemic_heart_disease: "만성 허혈성심장질환",
  angina_pectoris: "협심증",
} as const satisfies Record<string, string>;

export type KnownCategory = keyof typeof CATEGORY_LABEL;

export const KNOWN_CATEGORIES: readonly KnownCategory[] = Object.keys(
  CATEGORY_LABEL,
) as KnownCategory[];

/**
 * 카테고리 key → 한글 라벨. 매핑 누락 시 key 그대로 반환 (UI 깨짐 방지).
 * 운영 모니터링은 호출부에서 별도로 (KNOWN_CATEGORIES 와 diff).
 */
export function labelForCategory(category: string): string {
  return (CATEGORY_LABEL as Record<string, string>)[category] ?? category;
}

/** 두 카테고리를 한글 라벨 기준 가나다순 비교. Intl.Collator(ko) 사용. */
const KO_COLLATOR = new Intl.Collator("ko", { sensitivity: "base" });

export function compareCategoryByLabel(a: string, b: string): number {
  return KO_COLLATOR.compare(labelForCategory(a), labelForCategory(b));
}
