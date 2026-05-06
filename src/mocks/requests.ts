import type { MatchRequest } from "@/features/requests/schema";

/**
 * MVP — Server Action이 push하는 in-memory 스토어.
 * dev 서버 재시작 시 초기화.
 *
 * 시드 1건: `/result/demo-result-token` 으로 진입하면 결과 페이지 데모 가능.
 * 가입자 흐름이 끝까지 돌지 않은 상태에서도 결과 화면을 검토할 수 있도록 준비.
 */
/**
 * 결과(완료) 데모: `/result/demo-result-token`
 * 진설계 제출 데모: `/agent/assignments/tok-demo-pending` (demo-req-002 의 pending assignment)
 */
export const MOCK_MATCH_REQUESTS: MatchRequest[] = [
  {
    id: "demo-req-001",
    step1: {
      categories: ["health", "life"],
      ageRange: "30s",
      gender: "male",
      region: "서울",
      monthlyBudgetMin: 100000,
      monthlyBudgetMax: 200000,
    },
    step3: {
      birthDate: "1992-08-14",
      occupation: "회사원",
      smoker: false,
      heightCm: 178,
      weightKg: 72,
      hasExistingInsurance: false,
      consentThirdParty: "on",
      consentMessaging: "on",
      phone: "01099998888",
    },
    candidateAgentIds: [
      "agent-001",
      "agent-002",
      "agent-004",
      "agent-005",
      "agent-008",
    ],
    selectedAgentIds: ["agent-001", "agent-002", "agent-005"],
    status: "completed",
    createdAt: "2026-05-04T10:00:00.000Z",
    dispatchedAt: "2026-05-04T10:05:00.000Z",
    deadlineAt: "2026-05-06T10:05:00.000Z",
    rematchCount: 0,
    resultToken: "demo-result-token",
  },
  /**
   * 설계사 시점 데모 — 아직 dispatched 상태, 마감까지 36시간 남은 케이스.
   * agent-008 (오미래) 가 진설계를 작성해야 함.
   */
  {
    id: "demo-req-002",
    step1: {
      categories: ["health", "child"],
      ageRange: "30s",
      gender: "female",
      region: "경기",
      monthlyBudgetMin: 50000,
      monthlyBudgetMax: 100000,
    },
    step3: {
      birthDate: "1991-03-22",
      occupation: "프리랜서 디자이너",
      smoker: false,
      heightCm: 162,
      weightKg: 53,
      hasExistingInsurance: true,
      existingInsuranceNote:
        "10년 전 가입한 실손 1세대가 있는데 자녀 보험은 처음이에요.",
      medicalHistory: "특이사항 없음",
      consentThirdParty: "on",
      consentMessaging: "on",
      phone: "01077776666",
    },
    candidateAgentIds: [
      "agent-002",
      "agent-006",
      "agent-008",
      "agent-004",
      "agent-001",
    ],
    selectedAgentIds: ["agent-002", "agent-006", "agent-008"],
    status: "dispatched",
    createdAt: "2026-05-04T22:00:00.000Z",
    dispatchedAt: "2026-05-04T22:05:00.000Z",
    // 마감까지 약 36시간 (2026-05-06 10:05Z = 19:05 KST)
    deadlineAt: "2026-05-06T10:05:00.000Z",
    rematchCount: 0,
    resultToken: "tok-demo-result-002",
  },
  /**
   * AI 분석 중 — K명 전원 제출 완료, 결과 발송 직전.
   */
  {
    id: "demo-req-003",
    step1: {
      categories: ["pension"],
      ageRange: "50s",
      gender: "male",
      region: "부산",
      monthlyBudgetMin: 200000,
      monthlyBudgetMax: 300000,
    },
    step3: {
      birthDate: "1972-11-09",
      occupation: "자영업",
      smoker: true,
      heightCm: 173,
      weightKg: 78,
      hasExistingInsurance: true,
      consentThirdParty: "on",
      consentMessaging: "on",
      phone: "01066665555",
    },
    candidateAgentIds: ["agent-005", "agent-001", "agent-008"],
    selectedAgentIds: ["agent-005", "agent-001"],
    status: "analyzing",
    createdAt: "2026-05-05T08:00:00.000Z",
    dispatchedAt: "2026-05-05T08:05:00.000Z",
    deadlineAt: "2026-05-07T08:05:00.000Z",
    rematchCount: 0,
    resultToken: "tok-demo-analyzing",
  },
  /**
   * 0명 제출 → 자동 재매칭 트리거된 케이스 (어드민 별표 표시).
   */
  {
    id: "demo-req-004",
    step1: {
      categories: ["fire"],
      ageRange: "40s",
      gender: "female",
      region: "제주",
      monthlyBudgetMin: 30000,
      monthlyBudgetMax: 50000,
    },
    step3: {
      birthDate: "1981-06-14",
      occupation: "교사",
      smoker: false,
      heightCm: 168,
      weightKg: 60,
      hasExistingInsurance: false,
      consentThirdParty: "on",
      consentMessaging: "on",
      phone: "01055554444",
    },
    candidateAgentIds: ["agent-003", "agent-007"],
    selectedAgentIds: ["agent-003", "agent-007"],
    status: "rematching",
    createdAt: "2026-05-04T15:00:00.000Z",
    dispatchedAt: "2026-05-04T15:05:00.000Z",
    deadlineAt: "2026-05-06T15:05:00.000Z",
    rematchCount: 1,
  },
  /**
   * 후보 선택 중 — 가입자가 후보 보고 선택 진행 중.
   */
  {
    id: "demo-req-005",
    step1: {
      categories: ["health"],
      ageRange: "20s",
      gender: "female",
      region: "서울",
      monthlyBudgetMin: 50000,
      monthlyBudgetMax: 100000,
    },
    candidateAgentIds: ["agent-002", "agent-004", "agent-008", "agent-006"],
    selectedAgentIds: [],
    status: "selecting",
    createdAt: "2026-05-06T01:30:00.000Z",
    rematchCount: 0,
  },
];
