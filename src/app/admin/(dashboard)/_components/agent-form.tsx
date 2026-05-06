"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAgent,
  updateAgent,
  type AgentMutationState,
} from "@/features/agents/actions";
import type { AgentInput } from "@/features/agents/schema";
import {
  Chip,
  ChipGroup,
} from "@/features/requests/ui/wizard-primitives";
import { cn } from "@/lib/utils";
import {
  INSURANCE_CATEGORIES,
  INSURANCE_CATEGORY_LABEL,
  type InsuranceCategory,
} from "@/types";

/**
 * 설계사 등록/편집 폼 — 어드민.
 *
 * `initial` 가 주어지면 update 모드 (수정), 없으면 create 모드 (신규).
 * 카테고리는 정확히 2개 선택 (PRD §5.8) — 클라이언트 한도 + 서버 zod refine 양쪽 검증.
 */
export function AgentForm({
  agentId,
  initial,
}: {
  agentId?: string;
  initial?: AgentInput;
}) {
  const isEdit = !!agentId;
  const action = isEdit ? updateAgent.bind(null, agentId!) : createAgent;

  const [state, formAction, pending] = useActionState<
    AgentMutationState,
    FormData
  >(action as (s: AgentMutationState, fd: FormData) => Promise<AgentMutationState>, undefined);

  const [specialties, setSpecialties] = useState<InsuranceCategory[]>(
    initial?.specialties ?? [],
  );
  const [active, setActive] = useState<boolean>(initial?.active ?? true);

  const errors = state && "errors" in state ? state.errors : undefined;
  const success = state && "ok" in state && state.ok;

  function toggleSpecialty(c: InsuranceCategory) {
    setSpecialties((prev) => {
      if (prev.includes(c)) return prev.filter((x) => x !== c);
      if (prev.length >= 2) return prev;
      return [...prev, c];
    });
  }

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
          <Field label="아바타 URL" error={errors?.avatarUrl?.[0]}>
            <Input
              name="avatarUrl"
              type="url"
              defaultValue={initial?.avatarUrl ?? ""}
              placeholder="https://..."
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

      <Section
        title="전문 보험 (정확히 2개)"
        helper={`현재 ${specialties.length}/2 선택`}
      >
        <ChipGroup>
          {INSURANCE_CATEGORIES.map((c) => {
            const selected = specialties.includes(c);
            const disabled = !selected && specialties.length >= 2;
            return (
              <Chip
                key={c}
                selected={selected}
                onClick={() => !disabled && toggleSpecialty(c)}
              >
                {INSURANCE_CATEGORY_LABEL[c]}
              </Chip>
            );
          })}
        </ChipGroup>
        {specialties.map((s) => (
          <input key={s} type="hidden" name="specialties" value={s} />
        ))}
        {errors?.specialties && (
          <p className="text-xs text-red-600">{errors.specialties[0]}</p>
        )}
      </Section>

      <Section title="연락처 (운영 — 가입자 비노출)">
        <div className="grid grid-cols-2 gap-6">
          <Field label="휴대폰 (알림톡)" error={errors?.phone?.[0]}>
            <Input
              name="phone"
              type="tel"
              defaultValue={initial?.phone ?? ""}
              placeholder="01012345678"
              className="h-11"
            />
          </Field>
          <Field label="이메일 (로그인)" error={errors?.email?.[0]}>
            <Input
              name="email"
              type="email"
              defaultValue={initial?.email ?? ""}
              placeholder="agent@dopda.kr"
              className="h-11"
            />
          </Field>
        </div>
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
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform",
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
          disabled={pending || specialties.length !== 2}
          className="h-11 rounded-full px-8 text-sm font-medium"
        >
          {pending ? "저장 중..." : isEdit ? "변경 저장" : "등록"}
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
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#efefef] bg-white p-6 flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-black tracking-tight">{title}</h2>
        {helper && <span className="text-xs text-[#4b4b4b]">{helper}</span>}
      </div>
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
