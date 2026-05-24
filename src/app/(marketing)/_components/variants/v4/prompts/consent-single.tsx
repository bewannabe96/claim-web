"use client";

import { Button } from "@/components/ui/button";

/**
 * Q10 — 알림톡 수신 단일 동의.
 *
 * "네, 좋아요" / "아직이요" 두 카드. 네 선택 시 onAgree 발화 → finalize 진행.
 * 거부 시는 위젯 안에서 봇 메시지 재요청 (안 누르면 진행 불가). 둘 다 한 번에
 * 보여줘 시각적 강제 인상이 덜한 톤.
 *
 * consentThirdParty 는 챗봇 진입 자체로 implicit — finalizeRequest 호출 시
 * chatbot-shell 이 "off" 로 명시 전송 (DB 에 false 저장).
 */
export function ConsentSingle({
  onAgree,
  onDecline,
}: {
  onAgree: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onDecline}
        className="h-14 flex-1 rounded-full bg-[#efefef] text-sm font-medium text-black transition-colors hover:bg-[#e2e2e2]"
      >
        아직이요
      </button>
      <Button
        type="button"
        onClick={onAgree}
        className="h-14 flex-[2] rounded-full text-sm font-medium"
      >
        네, 좋아요
      </Button>
    </div>
  );
}
