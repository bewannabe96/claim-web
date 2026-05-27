import {
  cardMetaFromProposal,
  type CardMeta,
} from "@/features/plan-proposals/card-meta";
import type { PlanProposalCard } from "@/features/plan-proposals/queries";

import { getAnalysisEntry } from "./registry";
import { UnsupportedAnalysisVersion } from "./unsupported";
import type {
  AnalysisVersionEntry,
  RawAnalysisReport,
  RenderAnalysisBody,
} from "./types";

/* ============================================================
 * buildAnalysisRenderer — 라우트의 단일 진입점.
 *
 * cards × rawReports 를 버전별로 그룹핑·parse·adapt 후, 활성 카드를 받아
 * 해당 버전 entry 의 ActiveBody 를 렌더하는 클로저를 반환. 같은 버전 peers
 * 는 클로저에 닫혀 들어가 ROI 멀티라인 등 cross-card 비교가 자연스럽게
 * 같은 버전 안에서만 일어남.
 *
 * 에러 격리:
 *   - rawReport 가 null → CardMeta.analyzed=false / schemaVersion=undefined.
 *     shell 이 placeholder 로 처리 (renderAnalysisBody 호출 안 함).
 *   - schemaVersion 이 registry 에 없음 → CardMeta.schemaVersion 은 그 값 유지,
 *     renderAnalysisBody 호출 시 <UnsupportedAnalysisVersion version={...} />.
 *   - parseReport / adapt throw → 로그 + 그 카드만 UnsupportedAnalysisVersion.
 *   - 한 카드의 실패가 다른 카드 렌더를 막지 않음.
 * ============================================================ */

type VersionGroup = {
  entry: AnalysisVersionEntry<unknown, unknown>;
  /** 같은 버전의 모든 ViewData (cross-card 비교 차트가 peers 로 받음). */
  peers: unknown[];
  /** proposal.id → ViewData lookup. active 의 본문 데이터 조회. */
  byCardId: Map<string, unknown>;
};

export function buildAnalysisRenderer(params: {
  cards: PlanProposalCard[];
  /** cards 와 같은 길이·순서. 분석 리포트가 없으면 null. */
  rawReports: ReadonlyArray<RawAnalysisReport | null>;
  customerAge: number;
  scenarioPriority: readonly string[];
}): {
  cardMetas: CardMeta[];
  renderAnalysisBody: RenderAnalysisBody;
} {
  const { cards, rawReports, customerAge, scenarioPriority } = params;

  const groups = new Map<number, VersionGroup>();
  const cardMetas: CardMeta[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const raw = rawReports[i];

    cardMetas.push(cardMetaFromProposal(card, raw?.schemaVersion));

    if (!raw) continue;
    const entry = getAnalysisEntry(raw.schemaVersion);
    if (!entry) continue; // shell 이 UnsupportedAnalysisVersion 으로 graceful

    let viewData: unknown;
    try {
      const parsed = entry.parseReport(raw.report);
      viewData = entry.adapt(card, parsed, customerAge);
    } catch (err) {
      // parse / adapt 실패 — 그 카드만 격리. 다른 카드는 정상 렌더.
      console.warn(
        `[analysis] parse/adapt failed for proposal=${card.proposal.id} v${raw.schemaVersion}`,
        err,
      );
      continue;
    }

    let group = groups.get(raw.schemaVersion);
    if (!group) {
      group = { entry, peers: [], byCardId: new Map() };
      groups.set(raw.schemaVersion, group);
    }
    group.peers.push(viewData);
    group.byCardId.set(card.proposal.id, viewData);
  }

  const renderAnalysisBody: RenderAnalysisBody = (active) => {
    const version = active.schemaVersion;
    if (version == null) {
      // 분석 미완료 — shell 이 이미 placeholder 처리. 도달하면 안 됨.
      return null;
    }
    const group = groups.get(version);
    if (!group) {
      return <UnsupportedAnalysisVersion version={version} />;
    }
    const data = group.byCardId.get(active.id);
    if (data === undefined) {
      // parse 실패해서 group 에 안 들어간 카드 — 위 try/catch 의 격리 결과.
      return <UnsupportedAnalysisVersion version={version} />;
    }
    const Body = group.entry.ActiveBody;
    return (
      <Body
        active={data}
        peers={group.peers}
        scenarioPriority={scenarioPriority}
      />
    );
  };

  return { cardMetas, renderAnalysisBody };
}

export {
  ANALYSIS_VERSIONS,
  SUPPORTED_ANALYSIS_VERSIONS,
  getAnalysisEntry,
} from "./registry";

export type { AnalysisVersionEntry, RawAnalysisReport, RenderAnalysisBody };
