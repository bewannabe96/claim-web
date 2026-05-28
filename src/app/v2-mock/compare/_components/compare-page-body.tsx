"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createPendingSlot, MOCK_SLOTS } from "../../_lib/mock-slots";
import {
  SignupModal,
  type SignupTrigger,
} from "../../_components/signup-modal";

import { AddSlotSheet } from "./add-slot-sheet";
import { WorkbenchView } from "./workbench-view";

/* ============================================================
 * Compare page client wrapper.
 *
 * 두 단계 modal 흐름 — v2 PRD §4.4/§4.5:
 *
 *   chip [+ 제안서 추가] → AddSlotSheet (옵션 picker, mock authed toggle)
 *
 *   비회원 (toggle = 비회원):
 *     [업로드]   → SignupModal (second_upload trigger)
 *     [받기]     → SignupModal (pool_entry trigger)
 *
 *   회원 (toggle = 회원):
 *     [업로드]   → /v2-mock/upload navigate (이미 가입 완료라 picker 우회 후 바로 form)
 *     [받기]     → /v2-mock/plan-request/new navigate (5-phase wizard 그대로 진입)
 *
 * 실 라우트는 서버가 세션으로 자동 판별 — toggle 없음. mock 의 시연 일관성용.
 *
 * URL `?gate=second-upload|pool-entry|provisional-cta` 로 진입한 경우 mount 직후
 * 해당 게이트가 열린 상태로 시작 (picker 우회) — 스테이크홀더 데모 URL 시연용.
 * ============================================================ */

const URL_TO_TRIGGER: Record<string, SignupTrigger> = {
  "second-upload": "second_upload",
  "pool-entry": "pool_entry",
  "provisional-cta": "provisional_cta",
};

export function ComparePageBody({
  initialGate,
  hasPendingSlot,
}: {
  initialGate: string | null;
  /** /v2-mock/upload 에서 analyzing → 자동 복귀했을 때 true. 분석 중 슬롯 1개 prepend. */
  hasPendingSlot: boolean;
}) {
  const router = useRouter();
  const [trigger, setTrigger] = useState<SignupTrigger | null>(null);
  const [addSlotOpen, setAddSlotOpen] = useState(false);

  // pending 슬롯 (분석 중) prepend — 업로드 직후 workspace 자동 복귀 시 활용.
  // useMemo 로 mount 시 한 번만 createPendingSlot 호출 (Date.now 기반 id 안정).
  const initialSlots = useMemo(() => {
    if (!hasPendingSlot) return MOCK_SLOTS;
    return [createPendingSlot(), ...MOCK_SLOTS];
  }, [hasPendingSlot]);

  useEffect(() => {
    if (initialGate && URL_TO_TRIGGER[initialGate]) {
      setTrigger(URL_TO_TRIGGER[initialGate]);
    }
  }, [initialGate]);

  function handleSelectUpload(authed: boolean) {
    setAddSlotOpen(false);
    if (authed) {
      router.push("/v2-mock/upload");
    } else {
      setTrigger("second_upload");
    }
  }

  function handleSelectPool(authed: boolean) {
    setAddSlotOpen(false);
    if (authed) {
      router.push("/v2-mock/plan-request/new");
    } else {
      setTrigger("pool_entry");
    }
  }

  return (
    <>
      <WorkbenchView
        initialSlots={initialSlots}
        onAddSlot={() => setAddSlotOpen(true)}
        onProvisionalSignup={() => setTrigger("provisional_cta")}
      />

      <AddSlotSheet
        open={addSlotOpen}
        onClose={() => setAddSlotOpen(false)}
        onSelectUpload={handleSelectUpload}
        onSelectPool={handleSelectPool}
      />

      <SignupModal
        open={trigger !== null}
        trigger={trigger}
        onClose={() => setTrigger(null)}
      />
    </>
  );
}
