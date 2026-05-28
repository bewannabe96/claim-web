import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { PartnerAvatar } from "@/features/partners/ui/partner-avatar";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

import type { MockSlot } from "../../_lib/mock-slots";

import { OriginBadge } from "./origin-badge";

/* ============================================================
 * Attribution 카드 — 본문 끝에서 "이 슬롯의 출처" 컨텍스트.
 *
 * v1 의 ActiveCardBody 가 본문 끝에 partner attribution 을 박는 패턴 (always
 * partner_submit). v2 에서는 origin 별로 다른 attribution 이 필요:
 *
 *   - partner_submit  → v1 그대로 (PartnerAvatar + 이름 + 경력 + trust metric)
 *   - customer_upload → 보험사 / 상품명 / 업로드 일시 / (있다면) 가입자가 적은
 *                       설계사 이름. v1 partner 정보 자리에 OriginBadge.
 *
 * mock 단계라 v1 컴포넌트는 안 건드림.
 * ============================================================ */
export function SlotAttribution({ slot }: { slot: MockSlot }) {
  if (slot.origin === "partner_submit") {
    return (
      <section
        className={cn("rounded-xl border border-[#efefef] p-5", NO_TRACK_CLASS)}
      >
        <header className="flex items-start gap-3">
          <PartnerAvatar
            name={slot.meta.partner.name}
            avatarUrl={slot.meta.partner.avatarUrl}
            className="w-12 h-12 text-lg font-bold"
            fallbackClassName="bg-black text-white"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-black">
                {slot.meta.partner.name}
              </span>
              <span className="text-xs text-[#4b4b4b]">
                경력 {slot.meta.partner.yearsOfExperience}년
              </span>
              <OriginBadge origin="partner_submit" size="xs" />
            </div>
            <p className="mt-0.5 text-xs text-[#4b4b4b]">
              {slot.meta.partner.trustMetric}
            </p>
          </div>
        </header>
      </section>
    );
  }

  // customer_upload — v2 신규
  const meta = slot.externalMeta;
  return (
    <section className="rounded-xl border border-[#efefef] p-5 flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-[#4b4b4b]">출처</span>
        <OriginBadge origin="customer_upload" size="sm" />
      </header>
      <dl className="flex flex-col gap-2 text-xs">
        <DefRow label="보험사" value={meta?.insurerName ?? slot.view.insurer} />
        <DefRow label="상품명" value={meta?.productName ?? "—"} />
        {meta?.proposerName ? (
          <DefRow label="설계사" value={meta.proposerName} />
        ) : null}
        <DefRow
          label="업로드"
          value={meta ? formatDateTime(meta.uploadedAt) : "—"}
        />
      </dl>
    </section>
  );
}

function DefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-14 shrink-0 text-[#afafaf]">{label}</dt>
      <dd className="flex-1 min-w-0 text-black font-medium break-words">
        {value}
      </dd>
    </div>
  );
}
