"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSettings } from "@/features/admin/actions";
import type { SettingsInput } from "@/features/admin/schema";

import { Banner, Card } from "../_components/page-shell";

/**
 * 5개 파라미터를 1개 카드 안 row 로 묶어 비교/스캔이 쉽도록 함.
 *
 * Uncontrolled + 부모 key 로 입력만 강제 remount — Base UI Input 의
 * defaultValue 후속 변경 경고를 피하면서 success/error 메시지는 useActionState
 * 가 유지.
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
    <form action={formAction} className="flex flex-col gap-5">
      <Card padding="none">
        <SettingFields key={fieldsKey} initial={initial} errors={errors} />
      </Card>

      {errors?._form && <Banner tone="error">{errors._form[0]}</Banner>}
      {success && (
        <Banner tone="success">
          저장되었습니다. 다음 매칭부터 새 값이 적용돼요.
        </Banner>
      )}

      <div className="flex justify-end">
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
    <div className="divide-y divide-[#efefef]">
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
        helper="가입자가 선택할 수 있는 최대 인원. 후보 수 이하."
        defaultValue={initial.selectLimit}
        unit="명"
        error={errors?.selectLimit?.[0]}
      />
      <SettingField
        name="submissionDeadlineHours"
        label="제출 마감 시간 (T)"
        helper="설계사 제안서 제출 시간. 초과 시 미제출 처리."
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
        helper="가입자 결과 페이지 유지 일수. 경과 시 토큰 만료."
        defaultValue={initial.resultRetentionDays}
        unit="일"
        error={errors?.resultRetentionDays?.[0]}
      />
    </div>
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
    <div className="grid grid-cols-[1fr_auto] items-center gap-6 px-6 py-5">
      <div className="flex flex-col gap-0.5 min-w-0">
        <label htmlFor={name} className="text-sm font-medium text-black">
          {label}
        </label>
        <p className="text-xs text-[#4b4b4b]">{helper}</p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="relative w-32">
        <Input
          id={name}
          name={name}
          type="number"
          defaultValue={defaultValue}
          min={1}
          className="h-10 pr-10 text-right tabular-nums"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#afafaf] pointer-events-none">
          {unit}
        </span>
      </div>
    </div>
  );
}
