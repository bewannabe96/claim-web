"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSettings } from "@/features/admin/actions";
import type { SettingsInput } from "@/features/admin/schema";

/**
 * Uncontrolled 폼 + key 로 입력만 강제 remount.
 *
 * Base UI Input 은 `defaultValue` 의 후속 변경에 warn — server action 성공 후
 * revalidatePath 가 새 initial 을 prop 으로 흘리면 발생. controlled 로 가면
 * React 19 `<form action>` 이 transition 안에서 client state 복원 흐름이
 * 꼬임 (invalid 제출 시 사용자 입력이 사라짐).
 *
 * 해결: `useActionState` 는 부모 (이 컴포넌트) 에 두고 success/error 메시지
 * 도 여기서 렌더 — 입력 필드만 key 로 묶어 remount. initial 이 바뀌면 (성공
 * 저장 후 revalidate) 입력만 새 defaultValue 로 초기화되고, 성공 메시지는
 * useActionState 상태 그대로 유지.
 */
export function SettingsForm({
  initial,
}: {
  initial: SettingsInput;
}) {
  const [state, formAction, pending] = useActionState(saveSettings, undefined);
  const errors = state && "errors" in state ? state.errors : undefined;
  const success = state && "ok" in state && state.ok;

  const fieldsKey = [
    initial.candidateCount,
    initial.selectLimit,
    initial.submissionDeadlineHours,
    initial.penaltyWindow,
    initial.resultRetentionDays,
  ].join("|");

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <SettingFields key={fieldsKey} initial={initial} errors={errors} />

      {errors?._form && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {errors._form[0]}
        </p>
      )}
      {success && (
        <p className="text-sm text-black bg-[#efefef] px-3 py-2 rounded-lg">
          저장되었습니다. 다음 매칭부터 새 값이 적용돼요.
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full px-8 text-sm font-medium"
        >
          {pending ? "저장 중..." : "변경 저장"}
        </Button>
      </div>
    </form>
  );
}

function SettingFields({
  initial,
  errors,
}: {
  initial: SettingsInput;
  errors: Partial<Record<keyof SettingsInput | "_form", string[]>> | undefined;
}) {
  return (
    <>
      <SettingField
        name="candidateCount"
        label="후보 수 (N)"
        helper="가입자에게 노출할 설계사 후보 인원"
        defaultValue={initial.candidateCount}
        unit="명"
        error={errors?.candidateCount?.[0]}
      />
      <SettingField
        name="selectLimit"
        label="선택 한도 (K)"
        helper="가입자가 선택할 수 있는 최대 인원. 후보 수보다 작거나 같아야 함."
        defaultValue={initial.selectLimit}
        unit="명"
        error={errors?.selectLimit?.[0]}
      />
      <SettingField
        name="submissionDeadlineHours"
        label="제출 마감 시간 (T)"
        helper="설계사가 제안서를 제출할 수 있는 시간. 만료 시 미제출 처리."
        defaultValue={initial.submissionDeadlineHours}
        unit="시간"
        error={errors?.submissionDeadlineHours?.[0]}
      />
      <SettingField
        name="penaltyWindow"
        label="페널티 윈도우"
        helper="미제출률 계산에 사용하는 최근 N건"
        defaultValue={initial.penaltyWindow}
        unit="건"
        error={errors?.penaltyWindow?.[0]}
      />
      <SettingField
        name="resultRetentionDays"
        label="결과 보관 기간"
        helper="가입자 결과 페이지가 유지되는 일수. 경과 시 토큰 만료 처리."
        defaultValue={initial.resultRetentionDays}
        unit="일"
        error={errors?.resultRetentionDays?.[0]}
      />
    </>
  );
}

function SettingField({
  name,
  label,
  helper,
  defaultValue,
  unit,
  error,
}: {
  name: string;
  label: string;
  helper: string;
  defaultValue: number;
  unit: string;
  error?: string;
}) {
  return (
    <div className="rounded-xl border border-[#efefef] bg-white p-6 grid grid-cols-2 gap-6 items-start">
      <div className="flex flex-col gap-1">
        <label htmlFor={name} className="text-sm font-bold text-black">
          {label}
        </label>
        <p className="text-xs text-[#4b4b4b] leading-relaxed">{helper}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <Input
            id={name}
            name={name}
            type="number"
            defaultValue={defaultValue}
            min={1}
            className="h-11 pr-12"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#4b4b4b] pointer-events-none">
            {unit}
          </span>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
