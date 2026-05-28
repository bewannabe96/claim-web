"use client";

import { useState } from "react";

import { ClaimStudioMark } from "../../_components/claim-studio-mark";
import { EntryCard } from "../../_components/entry-card";
import {
  SignupModal,
  type SignupTrigger,
} from "../../_components/signup-modal";

/* ============================================================
 * Empty workbench — v2 PRD §4.1 의 "entry — 비교 도구 첫 도착".
 *
 * Hero — product positioning:
 *   - chrome: <ClaimStudioMark /> ("CLAIM Studio" wordmark, 작게 — product anchor)
 *   - h1:     "제안서 비교를 시작해요" (action 톤. chrome 의 wordmark 와 중복 회피)
 *   - p:      "받으신 제안서를 가져와서 시장 평균과 객관 비교해보세요" (한 줄 소개)
 *
 * 두 entry CTA — **동일 디자인** (primary/secondary 구분 없음). 두 entry 모두 가입
 * 모달 trigger (mock 일관성).
 *
 * 빈 슬롯 placeholder carousel 은 의도적으로 제거 — hero + CTA 만으로 페이지가
 * 충분히 명료.
 * ============================================================ */
export function EmptyWorkbench() {
  const [trigger, setTrigger] = useState<SignupTrigger | null>(null);

  return (
    <>
      <main className="flex-1 flex flex-col px-6 pt-10 pb-12">
        <ClaimStudioMark />

        <header className="mt-10 flex flex-col gap-3">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-black">
            제안서 비교를 시작해요
          </h1>
          <p className="text-sm text-[#4b4b4b] leading-relaxed">
            받으신 제안서를 가져와서
            <br />
            시장 평균과 객관 비교해보세요.
          </p>
        </header>

        {/* 두 entry — 동일 디자인. 라벨/설명만. */}
        <section className="mt-12 flex flex-col gap-3">
          <EntryCard
            label="PDF 또는 사진 업로드"
            desc={
              <>
                외부에서 받은 제안서의 PDF 나 사진을 올리면 객관 리포트로
                변환해드려요. 다른 제안서와 함께 비교에 활용할 수 있어요.
              </>
            }
            onClick={() => setTrigger("second_upload")}
          />
          <EntryCard
            label="클레임 파트너로부터 받기"
            desc={
              <>
                CLAIM 에서 활동하는 독립 설계사를 직접 선택해 제안서를 요청하고
                비교해보세요.{" "}
                <b className="text-black">영업 전화는 절대 없어요.</b>
              </>
            }
            onClick={() => setTrigger("pool_entry")}
          />
        </section>
      </main>

      <SignupModal
        open={trigger !== null}
        trigger={trigger}
        onClose={() => setTrigger(null)}
      />
    </>
  );
}

