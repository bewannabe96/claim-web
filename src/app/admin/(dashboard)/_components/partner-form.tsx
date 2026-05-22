"use client";

import { useActionState, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  lookupAdminUserByPhone,
  type PartnerMutationState,
} from "@/features/partners/actions";
import type { PartnerInput } from "@/features/partners/schema";
import { cn } from "@/lib/utils";

import { Banner, Card } from "./page-shell";

type FormAction = (
  state: PartnerMutationState,
  formData: FormData,
) => Promise<PartnerMutationState>;

/**
 * 설계사 폼 — 가입 초청 발급 / 미소비 초청 수정 / 등록된 설계사 편집 공용.
 *
 * 상위 페이지가 시점에 맞는 server action 을 `action` prop 으로 주입. 폼 필드 자체는
 * 세 시나리오 모두 동일.
 *
 * `enableAdminSelfLink` 가 true 인 경우 — 신규 invitation 발급 폼:
 *   phone 입력 onBlur 에 `lookupAdminUserByPhone` 호출 → 어드민 본인 phone 매칭 시
 *   "어드민 본인 설계사 등록" checkbox 노출.
 *
 * `lockedExistingUserId` — 수정 모드에서 기존 invitation 의 existingUserId 가
 *   set 인 경우. 안내 배지만 표시, phone 변경 차단 시각화 (readonly).
 */
export function PartnerForm({
  action,
  initial,
  submitLabel = "저장",
  pendingLabel = "저장 중...",
  enableAdminSelfLink = false,
  lockedExistingUserId = null,
}: {
  action: FormAction;
  initial?: PartnerInput;
  submitLabel?: string;
  pendingLabel?: string;
  enableAdminSelfLink?: boolean;
  lockedExistingUserId?: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    PartnerMutationState,
    FormData
  >(action, undefined);

  const [active, setActive] = useState<boolean>(initial?.active ?? true);

  type LookupState =
    | { kind: "idle" }
    | { kind: "matched"; userId: string; name: string };
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const [adminSelfChecked, setAdminSelfChecked] = useState(
    !!lockedExistingUserId,
  );
  const [, startLookup] = useTransition();
  const lastLookedPhone = useRef<string | null>(null);

  const runLookup = (phone: string) => {
    if (!enableAdminSelfLink) return;
    if (!/^01[0-9]{8,9}$/.test(phone)) {
      lastLookedPhone.current = phone;
      setLookup({ kind: "idle" });
      return;
    }
    if (lastLookedPhone.current === phone) return;
    lastLookedPhone.current = phone;
    startLookup(async () => {
      const result = await lookupAdminUserByPhone(phone);
      if (result.match) {
        setLookup({ kind: "matched", userId: result.userId, name: result.name });
      } else {
        setLookup({ kind: "idle" });
        setAdminSelfChecked(false);
      }
    });
  };

  const errors = state && "errors" in state ? state.errors : undefined;
  const success = state && "ok" in state && state.ok;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <SectionTitle>기본 정보</SectionTitle>
        <div className="flex flex-col gap-5 mt-5">
          <div className="grid grid-cols-2 gap-5">
            <Field label="이름" error={errors?.name?.[0]}>
              <Input
                name="name"
                type="text"
                defaultValue={initial?.name ?? ""}
                placeholder="홍길동"
                maxLength={20}
                className="h-11"
              />
            </Field>
            <Field label="휴대폰" error={errors?.phone?.[0]}>
              <Input
                name="phone"
                type="tel"
                defaultValue={initial?.phone ?? ""}
                placeholder="01012345678"
                className="h-11"
                readOnly={!!lockedExistingUserId}
                onBlur={(e) => runLookup(e.target.value.trim())}
              />
            </Field>
          </div>

          {enableAdminSelfLink && lookup.kind === "matched" && (
            <label className="flex items-start gap-3 rounded-xl border border-[#efefef] bg-[#fafafa] px-4 py-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={adminSelfChecked}
                onChange={(e) => setAdminSelfChecked(e.target.checked)}
              />
              <span className="flex-1 text-black">
                <span className="font-medium">어드민 본인 파트너 등록</span>
                <span className="block mt-0.5 text-xs text-[#4b4b4b]">
                  {lookup.name} (어드민) 본인 휴대폰으로 인식됐어요. 같은 계정에
                  파트너 권한을 추가하려면 체크해주세요.
                </span>
              </span>
            </label>
          )}
          {lockedExistingUserId && (
            <div className="rounded-xl border border-[#efefef] bg-[#fafafa] px-4 py-3 text-sm text-black">
              <span className="font-medium">어드민 본인 겸직 초청</span>
              <span className="block mt-0.5 text-xs text-[#4b4b4b]">
                휴대폰 번호는 어드민 등록 정보와 일치해야 하므로 변경할 수 없어요.
              </span>
            </div>
          )}
          {adminSelfChecked && lookup.kind === "matched" && (
            <input
              type="hidden"
              name="existingUserId"
              value={lookup.userId}
            />
          )}

          <Field label="한줄 소개" error={errors?.bio?.[0]}>
            <Input
              name="bio"
              type="text"
              defaultValue={initial?.bio ?? ""}
              placeholder="가입자 카드에 노출되는 한 문장"
              maxLength={60}
              className="h-11"
            />
          </Field>

          <div className="grid grid-cols-2 gap-5">
            <Field label="경력 (년)" error={errors?.yearsOfExperience?.[0]}>
              <Input
                name="yearsOfExperience"
                type="number"
                min={0}
                max={60}
                defaultValue={initial?.yearsOfExperience ?? ""}
                className="h-11"
              />
            </Field>
            <Field label="신뢰 지표" error={errors?.trustMetric?.[0]}>
              <Input
                name="trustMetric"
                type="text"
                defaultValue={initial?.trustMetric ?? ""}
                placeholder="예: 고객 96%가 계속 함께해요"
                maxLength={40}
                className="h-11"
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>자격</SectionTitle>
        <div className="mt-5">
          <Field label="파트너 자격번호" error={errors?.licenseNumber?.[0]}>
            <Input
              name="licenseNumber"
              type="text"
              defaultValue={initial?.licenseNumber ?? ""}
              placeholder="예: GA12345678"
              maxLength={40}
              className="h-11"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>상태</SectionTitle>
        <label className="mt-5 inline-flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={() => setActive((v) => !v)}
            className={cn(
              "relative w-11 h-6 rounded-full transition-colors",
              active ? "bg-black" : "bg-[#e2e2e2]",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform",
                active ? "translate-x-[22px]" : "translate-x-0.5",
              )}
            />
          </button>
          <span className="text-sm text-black">
            {active ? "활성 — 매칭 풀에 노출" : "비활성 — 매칭 풀에서 제외"}
          </span>
          {active && <input type="hidden" name="active" value="on" />}
        </label>
      </Card>

      {errors?._form && <Banner tone="error">{errors._form[0]}</Banner>}
      {success && <Banner tone="success">저장되었습니다.</Banner>}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full px-8 text-sm font-medium"
        >
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-black tracking-tight">{children}</h2>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[#4b4b4b]">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
