"use client";

import { useState, useTransition } from "react";

import type { RenderAnalysisBody } from "@/features/plan-proposals/analysis/types";
import type { CardMeta } from "@/features/plan-proposals/card-meta";
import { requestPlanProposalContact } from "@/features/plan-proposals/actions";
import type { ContactChannel } from "@/features/plan-proposals/schema";
import { ContactChannelSheet } from "@/features/plan-proposals/ui/contact-channel-sheet";
import { ContactCtaButton } from "@/features/plan-proposals/ui/contact-cta-button";
import { ProposalResultView } from "@/features/plan-proposals/ui/proposal-result-view";
import { ResultFooter } from "@/features/plan-proposals/ui/result-footer";

/**
 * 가입자 결과 페이지 wrapper — 공용 `ProposalResultView` 위에 가입자 전용 인터랙션
 * (상담 요청 / 채널 시트 / 보관기간 안내) 을 합성.
 *
 * 분석 본문은 페이지가 `buildAnalysisRenderer` 로 빌드해 `renderAnalysisBody`
 * 슬롯으로 전달 — 이 wrapper 자체는 분석 리포트 버전 무관.
 *
 * 호출자: `/plan-request/result/[token]` (가입자 단독). read-only 진입점 (예: 어드민
 * preview) 은 사이드이펙트가 없는 별도 wrapper (`PreviewResultView`).
 *
 * 연락 요청 상태 (`contactRequested`): SSR 의 `card.contactRequested` 기반으로 초기화
 * 후 client state 로 관리. 액션이 멱등이라 서버는 첫 호출만 카운터 +1, 클라는 응답과
 * 무관하게 즉시 토글 (optimistic).
 */
export function ResultView({
  resultToken,
  cards,
  renderAnalysisBody,
  resultRetentionDays,
}: {
  /** 결과 페이지 진입 토큰 — server action 호출 시 인증 키. */
  resultToken: string;
  cards: CardMeta[];
  renderAnalysisBody: RenderAnalysisBody;
  /** admin 이 설정한 결과 보관 기간 (일). 푸터 안내 문구에 노출. */
  resultRetentionDays: number;
}) {
  const [contactRequested, setContactRequested] = useState<Set<string>>(
    () => new Set(cards.filter((c) => c.contactRequested).map((c) => c.id)),
  );
  // 시트가 어느 카드에 대해 열렸는지 식별. 닫혀있으면 null. chip 탭 전환과 무관하게
  // 사용자가 누른 시점의 카드를 고정해 잘못된 설계사에게 연락 가는 케이스를 차단.
  const [sheetCardId, setSheetCardId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sheetCard = sheetCardId
    ? (cards.find((c) => c.id === sheetCardId) ?? null)
    : null;

  function markContactRequested(id: string, channel: ContactChannel) {
    if (contactRequested.has(id)) return;
    setContactRequested((s) => new Set(s).add(id));
    startTransition(async () => {
      const result = await requestPlanProposalContact(resultToken, id, channel);
      if (!result.ok) {
        // not_found / settled / invalid_channel — 새로고침 시 ExpiredState 가 렌더되거나
        // button 이 다시 활성되어 자연스럽게 이탈하므로 별도 토스트 없이 토글 롤백만.
        setContactRequested((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    });
  }

  return (
    <>
      <ProposalResultView
        cards={cards}
        renderAnalysisBody={renderAnalysisBody}
        bottomActionFor={(active) => (
          <ContactCtaButton
            partnerName={active.partner.name}
            contactRequested={contactRequested.has(active.id)}
            onClick={() => setSheetCardId(active.id)}
          />
        )}
        footer={<ResultFooter resultRetentionDays={resultRetentionDays} />}
      />

      <ContactChannelSheet
        open={sheetCard !== null}
        onClose={() => setSheetCardId(null)}
        onSelect={(channel) => {
          if (sheetCard) {
            markContactRequested(sheetCard.id, channel);
            setSheetCardId(null);
          }
        }}
      />
    </>
  );
}
