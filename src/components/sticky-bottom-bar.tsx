import { cn } from "@/lib/utils";

/**
 * 흐름 페이지 (wizard / form / status / onboarding) 의 primary CTA 영역.
 *
 * `<main className="flex flex-col flex-1 px-6 ...">` 의 마지막 자식으로 배치.
 *
 *   - `mt-auto` — 본문이 짧을 때 viewport bottom 으로 push (flex-col 안의 마지막 자식).
 *   - `sticky bottom-0` — 본문이 길어 scroll 가능할 때 항상 viewport bottom 에 stick.
 *   - `-mx-6` — main 의 `px-6` 좌우 padding 을 가로질러 viewport 양쪽 끝까지 확장.
 *     border / shadow / bg 가 풀-너비로 보여 sticky bar 의 분리감 확보.
 *   - bg-white + border-t + shadow — 본문과 시각 분리. 모바일 표준 sticky CTA chrome.
 *
 * **사용 규약**:
 *   - 부모 main 은 반드시 `flex flex-col flex-1 px-6 ...` (mt-auto 작동 + -mx-6 정합).
 *   - main 에 `pb-N` 두지 말 것 — CSS sticky 의 containing block 이 parent padding box
 *     이라 main 의 pb 가 sticky bar 의 viewport bottom 거리로 작동 (button 밑 여백
 *     이중 누적). 본문 spacing 은 sticky bar 의 자체 `pt-3 pb-4` 와 mt-auto 로 충분.
 *   - 자식은 보통 `<Button className="w-full h-14 rounded-full ..." />` 단일 또는
 *     `flex gap-3` 안의 prev/next 두 button. 여러 button 케이스는 자식이 자체 정렬.
 *
 * **이 컴포넌트가 책임지지 않는 surface** (각자 자체 fixed bottom 패턴):
 *   - workbench 의 `SlotActionBar` ([상담 진행하기]) — 슬롯 active 시에만 노출.
 *   - `ProposalResultView` 의 `ContactCtaButton` — 결과 페이지 본문이 항상 길어 fixed 우선.
 *   - bottom sheet (`SignupModal` / `AddSlotSheet` / `SlotRemoveConfirmSheet`) — 자체 modal 책임.
 */
export function StickyBottomBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-auto sticky bottom-0 -mx-6 px-6 pt-3 pb-4 bg-white border-t border-[#efefef] shadow-[0_-4px_16px_rgba(0,0,0,0.04)] z-40",
        className,
      )}
    >
      {children}
    </div>
  );
}
