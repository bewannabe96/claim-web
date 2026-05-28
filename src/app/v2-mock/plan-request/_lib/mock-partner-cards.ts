import type { PartnerCard } from "@/features/partners/schema";

/**
 * v2-mock 풀 path 의 candidates-selector 가 받는 후보 5명 — 실 DB 의
 * `getPartnerCardsByIds(req.candidatePartnerIds)` 결과를 정적으로 흉내낸다.
 *
 * 톤은 mock-slots.ts 의 partner 이름과 일관 (만화 캐릭터 — 실제 사람과 혼동 방지).
 * `trustMetric` / `bio` 는 mock 시연용 임의 문구 — 실 라우트는 admin 이 입력한
 * Partner row 값이 들어옴.
 *
 * 후보 마지막 1명은 `isNew=true` 로 두어 v1 CandidateCard 의 신규 라벨
 * ("새로운 추천 설계사") 분기까지 시연 가능.
 */
export const MOCK_CANDIDATE_PARTNERS: PartnerCard[] = [
  {
    id: "mock-candidate-1",
    name: "세일러문",
    bio: "20~30대 여성 가입자 1,200명을 도왔어요. 보장 두텁고 저렴한 설계가 강점이에요.",
    yearsOfExperience: 8,
    trustMetric: "재가입 고객 비율 상위 10%",
    isNew: false,
    avatarUrl: null,
  },
  {
    id: "mock-candidate-2",
    name: "액션가면",
    bio: "필요한 부분만 짚어 설명드려요. 가입 후에도 매년 상품 점검을 도와드려요.",
    yearsOfExperience: 5,
    trustMetric: "고객 평균 보장 만족도 4.8/5",
    isNew: false,
    avatarUrl: null,
  },
  {
    id: "mock-candidate-3",
    name: "도라에몽",
    bio: "신혼·자녀 출산 시기 보장 설계가 전문이에요. 가족 단위 설계 700건 이상.",
    yearsOfExperience: 12,
    trustMetric: "가족 단위 설계 누적 700+",
    isNew: false,
    avatarUrl: null,
  },
  {
    id: "mock-candidate-4",
    name: "짱구",
    bio: "보험은 처음이라 어려워하시는 분께 천천히 설명드려요.",
    yearsOfExperience: 3,
    trustMetric: "첫 가입자 응대 만족도 상위 5%",
    isNew: false,
    avatarUrl: null,
  },
  {
    id: "mock-candidate-5",
    name: "흰둥이",
    bio: "이제 막 활동을 시작했지만 누구보다 꼼꼼하게 비교해드려요.",
    yearsOfExperience: 1,
    trustMetric: "신규 등록",
    isNew: true,
    avatarUrl: null,
  },
];

/**
 * 가입자가 선택 가능한 최대 인원 — v1 의 `AppSettings.selectLimit` 기본값.
 * candidates-selector 가 prop 으로 받아 chip / CTA 라벨 / disabled 분기에 사용.
 */
export const MOCK_SELECT_LIMIT = 3;

/**
 * candidates 화면 헤더 subtitle — 매칭 신호 3개 (coverage · 직업 · 예산) 를
 * mock 으로 단순 hardcoded. 실 라우트는 step1 wizard 입력으로 derive.
 */
export const MOCK_CANDIDATES_SUBTITLE = "암 보장 중심 · 회사원 · 월 10~15만원";
