import { PartnerAvatar } from "@/features/partners/ui/partner-avatar";
import { cn } from "@/lib/utils";

/**
 * 설계사 한줄평 — 메신저 패턴(아바타 + 이름 + 좌상단 꼬리 말풍선).
 * "이 설계사가 보낸 메시지" 톤. 결과 페이지와 랜딩 데모가 공유.
 *
 * 바깥 여백은 호출자가 `className` 으로 — 컨테이너의 gap 정책에 맡긴다.
 */
export function PartnerNoteBubble({
  partnerName,
  avatarUrl,
  note,
  className,
}: {
  partnerName: string;
  avatarUrl: string | null;
  note: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <PartnerAvatar
        name={partnerName}
        avatarUrl={avatarUrl}
        className="h-8 w-8 text-[11px] font-bold"
        fallbackClassName="bg-black text-white"
      />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs text-[#4b4b4b]">{partnerName} 설계사</p>
        <div className="rounded-2xl rounded-tl-sm bg-[#f0f0f0] px-4 py-3">
          <p className="text-sm leading-relaxed text-black">{note}</p>
        </div>
      </div>
    </div>
  );
}
