import type { MatchRequest } from "@/features/requests/schema";

/**
 * MVP — Server Action이 push하는 in-memory 스토어.
 * dev 서버 재시작 시 초기화.
 *
 * 시드:
 * - demo-req-001 (completed) — 결과 페이지 데모: `/result/demo-result-token`
 * - demo-req-002 (dispatched) — 설계사 진설계 데모: `/agent/assignments/tok-demo-pending`
 * - demo-req-003 (analyzing) — 어드민 모니터링 다양성
 * - demo-req-004 (rematching) — 0명 제출 별표 케이스
 * - demo-req-005 (selecting) — 후보 선택 진행 중 케이스
 */
export const MOCK_MATCH_REQUESTS: MatchRequest[] = [
  {
    id: "demo-req-001",
    step1: {
      gender: "male",
      region: "서울",
      birthDate: "1992-08-14",
      occupation: "회사원",
      monthlyBudgetMin: 100000,
      monthlyBudgetMax: 200000,
      desiredCoverage:
        "암 진단금 위주로 보장 받고 싶고, 입원/수술비도 함께 봤으면 합니다.",
      medicalHistory: [],
      additionalNotes: "갱신형보다는 비갱신형을 선호해요.",
    },
    step3: {
      name: "박지훈",
      phone: "01099998888",
      consentThirdParty: "on",
      consentMessaging: "on",
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
      gender: "female",
      region: "경기",
      birthDate: "1991-03-22",
      occupation: "프리랜서 디자이너",
      monthlyBudgetMin: 50000,
      monthlyBudgetMax: 100000,
      desiredCoverage:
        "자녀(7세) 어린이 보험과 본인 여성 질환 보장을 함께 구성하고 싶어요.",
      medicalHistory: [
        {
          diagnosis: "갑상선 결절",
          treatmentPeriod: "within_10y",
          treatmentStartDate: "2022-09-15",
          hospitalizationDays: 0,
          outpatientVisits: 4,
          hadSurgery: false,
        },
      ],
      additionalNotes:
        "10년 전 가입한 실손 1세대가 있는데 자녀 보험은 처음이에요.",
    },
    step3: {
      name: "이수진",
      phone: "01077776666",
      consentThirdParty: "on",
      consentMessaging: "on",
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
      gender: "male",
      region: "부산",
      birthDate: "1972-11-09",
      occupation: "자영업",
      monthlyBudgetMin: 200000,
      monthlyBudgetMax: 300000,
      desiredCoverage:
        "노후 연금 + 사망보장 결합형으로 자녀에게 부담 없이 자산 이전.",
      medicalHistory: [
        {
          diagnosis: "고혈압",
          treatmentPeriod: "within_10y",
          treatmentStartDate: "2018-04-10",
          hospitalizationDays: 0,
          outpatientVisits: 24,
          hadSurgery: false,
        },
      ],
    },
    step3: {
      name: "최영수",
      phone: "01066665555",
      consentThirdParty: "on",
      consentMessaging: "on",
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
      gender: "female",
      region: "제주",
      birthDate: "1981-06-14",
      occupation: "교사",
      monthlyBudgetMin: 30000,
      monthlyBudgetMax: 50000,
      desiredCoverage: "자가 + 자동차 화재 통합 보장.",
      medicalHistory: [],
    },
    step3: {
      name: "한미경",
      phone: "01055554444",
      consentThirdParty: "on",
      consentMessaging: "on",
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
      gender: "female",
      region: "서울",
      birthDate: "2000-01-30",
      occupation: "대학원생",
      monthlyBudgetMin: 50000,
      monthlyBudgetMax: 100000,
      desiredCoverage:
        "20대 여성 기준 실손 + 암 진단금 기본 구성으로 가성비 좋게.",
      medicalHistory: [],
    },
    candidateAgentIds: ["agent-002", "agent-004", "agent-008", "agent-006"],
    selectedAgentIds: [],
    status: "selecting",
    createdAt: "2026-05-06T01:30:00.000Z",
    rematchCount: 0,
  },
];
