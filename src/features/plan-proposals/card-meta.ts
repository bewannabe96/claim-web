import type { PlanProposalCard } from "./queries";

/* ============================================================
 * CardMeta — 분석 리포트 버전과 무관한 카드 메타 (shell 단독 의존).
 *
 * Shell (chip 탭, sticky nav, 한줄평, attribution, CTA) 가 카드의 어떤 정보를
 * 필요로 하는지 한 곳에 정리. `PlanProposalCard` (proposal + partner) 와
 * (있다면) 분석 리포트의 `schemaVersion` 만으로 derive — 리포트 본문 (V5/V6 형태)
 * 을 보지 않는다. 따라서 shell 은 분석 리포트 버저닝 변화에 영향 없음.
 *
 * 분석 본문 (metrics / ROI / surrender 등) 은 별도 ViewData (버전별) 가 책임.
 * 라우트는 `buildAnalysisRenderer` (analysis/index.ts) 가 cards 를 cardMetas 로
 * 변환하고 `renderAnalysisBody` 클로저를 함께 돌려준다.
 * ============================================================ */

export type CardMeta = {
  /** PlanProposal.id — chip / attribution lookup 키. */
  id: string;

  partner: {
    name: string;
    yearsOfExperience: number;
    trustMetric: string;
    /** 프로필 사진 public URL. 미등록 partner 는 null (이니셜 fallback). */
    avatarUrl: string | null;
  };

  /** 설계사 한줄평 — 분석 리포트와 무관 (PlanProposal.note, 제출 시 작성). */
  note: string;

  /**
   * 분석 파이프라인 콜백 수신 여부 (proposal.analyzedAt 기반). false 면 shell 이
   * "분석 중" placeholder 로 본문 자리 대체 (`renderAnalysisBody` 호출 안 함).
   */
  analyzed: boolean;

  /**
   * 어드민이 "분석 건너뜀" 처리한 카드 (proposal.analysisSkippedAt 기반). true 면
   * shell 이 "분석 불가" placeholder. analyzed=true 와 동시에 true 일 수는 없음.
   */
  analysisSkipped: boolean;

  /**
   * 가입자가 이미 이 제안서에서 "상담 진행하기" 를 눌렀는지 (SSR 초기 state).
   * 인터랙티브 wrapper (가입자 ResultView) 가 useState 초기값으로 사용.
   */
  contactRequested: boolean;

  /**
   * 분석 리포트 schemaVersion — registry dispatch 키. 분석 리포트가 아직 없으면
   * undefined (shell 은 `analyzed=false` 로 placeholder, schemaVersion 안 봄).
   * 리포트가 있는데 registry 에 미등록 버전이면 set 된 값 그대로 — `UnsupportedAnalysisVersion`
   * 로 graceful 분기.
   */
  schemaVersion: number | undefined;
};

/**
 * `PlanProposalCard` + (있다면) `schemaVersion` → `CardMeta` 변환.
 * `buildAnalysisRenderer` 내부에서 카드별로 호출.
 */
export function cardMetaFromProposal(
  card: PlanProposalCard,
  schemaVersion: number | undefined,
): CardMeta {
  const { proposal, partner } = card;
  return {
    id: proposal.id,
    partner: {
      name: partner.name,
      yearsOfExperience: partner.yearsOfExperience,
      trustMetric: partner.trustMetric,
      avatarUrl: partner.avatarUrl,
    },
    note: proposal.note,
    analyzed: proposal.analyzedAt != null,
    analysisSkipped: proposal.analysisSkippedAt != null,
    contactRequested: proposal.contactRequestedAt != null,
    schemaVersion,
  };
}
