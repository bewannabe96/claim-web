"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  deletePartnerSignupInvitation,
  reissuePartnerSignupInvitationToken,
} from "@/features/partners/actions";

/**
 * 초청 운영 액션 — 재발급 / 삭제.
 *
 * 재발급: token 회전 + expiresAt 갱신.
 * 삭제: window.confirm 1단계 가드 후 server action → /admin/partners 로 이동.
 */
export function InvitationActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onReissue = () => {
    setError(null);
    startTransition(async () => {
      const result = await reissuePartnerSignupInvitationToken(invitationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const onDelete = () => {
    if (!confirm("초청을 삭제할까요? 발급된 가입 링크가 즉시 무효화됩니다.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deletePartnerSignupInvitation(invitationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/admin/partners");
    });
  };

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={onReissue}
          disabled={pending}
          variant="outline"
          className="h-10 rounded-full px-4 text-sm"
        >
          {pending ? "처리 중..." : "토큰 재발급"}
        </Button>
        <Button
          type="button"
          onClick={onDelete}
          disabled={pending}
          variant="destructive"
          className="h-10 rounded-full px-4 text-sm"
        >
          초청 삭제
        </Button>
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
