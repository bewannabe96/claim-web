import { cn } from "@/lib/utils";

/**
 * 봇 메시지 버블 — 좌측 정렬, 회색 배경.
 *
 * 챗봇 톤이 AI 어시스턴트이므로 별도 아바타 / 이름 표시 없이 버블만으로 화자
 * 구분. 사용자 버블(우측 검정) 과 한 화면에서 시각 위계가 자연스럽게 나뉘도록
 * 좌측 정렬 + 라이트 그레이.
 */
export function BotBubble({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          // `whitespace-pre-line` — 메시지 문자열의 \n 을 <br> 처럼 렌더 (가독성 위한
          // 의도된 줄바꿈 지원). 일반 공백/탭 연속은 그대로 collapse.
          "max-w-[85%] whitespace-pre-line rounded-2xl rounded-tl-md bg-[#efefef] px-4 py-3 text-sm leading-relaxed text-black",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
