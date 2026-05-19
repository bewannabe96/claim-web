"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PartnerMutationState } from "@/features/partners/actions";
import type { PartnerInput } from "@/features/partners/schema";
import { cn } from "@/lib/utils";

type FormAction = (
  state: PartnerMutationState,
  formData: FormData,
) => Promise<PartnerMutationState>;

/**
 * 설계사 폼 — 가입 초청 발급 / 미소비 초청 수정 / 등록된 설계사 편집 공용.
 *
 * 상위 페이지가 사용 시점에 맞는 server action 을 `action` prop 으로 주입.
 * 폼 필드 자체는 세 시나리오 모두 동일 (이메일 없음).
 */
export function PartnerForm({
  action,
  initial,
  submitLabel = "저장",
  pendingLabel = "저장 중...",
}: {
  action: FormAction;
  initial?: PartnerInput;
  submitLabel?: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<
    PartnerMutationState,
    FormData
  >(action, undefined);

  const [active, setActive] = useState<boolean>(initial?.active ?? true);

  const errors = state && "errors" in state ? state.errors : undefined;
  const success = state && "ok" in state && state.ok;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <Section title="기본 정보">
        <div className="grid grid-cols-2 gap-6">
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
            />
          </Field>
        </div>

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

        <div className="grid grid-cols-2 gap-6">
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
          <Field label="신뢰 지표 한 줄" error={errors?.trustMetric?.[0]}>
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
      </Section>

      <Section title="자격">
        <Field label="설계사 자격번호" error={errors?.licenseNumber?.[0]}>
          <Input
            name="licenseNumber"
            type="text"
            defaultValue={initial?.licenseNumber ?? ""}
            placeholder="예: GA12345678"
            maxLength={40}
            className="h-11"
          />
        </Field>
      </Section>

      <Section title="상태">
        <label className="inline-flex items-center gap-3 cursor-pointer">
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
      </Section>

      {errors?._form && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {errors._form[0]}
        </p>
      )}
      {success && (
        <p className="text-sm text-black bg-[#efefef] px-3 py-2 rounded-lg">
          저장되었습니다.
        </p>
      )}

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

/* ============================================================
 * 폼 primitives
 * ============================================================ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#efefef] bg-white p-6 flex flex-col gap-5">
      <h2 className="text-sm font-bold text-black tracking-tight">{title}</h2>
      {children}
    </section>
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
