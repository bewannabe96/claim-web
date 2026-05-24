import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { cn } from "@/lib/utils";

/**
 * 사용자 메시지 버블 — 우측 정렬, 검정 배경.
 *
 * 자유텍스트(직업/병력 진단명/추가요청/이름/생년월일/전화번호/OTP) 와 선택 chip
 * 라벨이 섞여 들어오므로 통째로 NO_TRACK_CLASS 부착 — PostHog autocapture /
 * session replay 에서 사용자 답변 영역 자체를 회피. 칩 라벨 자체는 PII 아니지만
 * 자유텍스트와 시각적 구분이 안 되므로 단일 클래스로 통일.
 */
export function UserBubble({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          // bot-bubble 과 동일하게 `whitespace-pre-line` — 자유텍스트 입력
          // (추가 요청사항 등) 에 사용자가 줄바꿈을 넣었으면 그대로 보존.
          "max-w-[85%] whitespace-pre-line rounded-2xl rounded-tr-md bg-black px-4 py-3 text-sm leading-relaxed text-white",
          NO_TRACK_CLASS,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
