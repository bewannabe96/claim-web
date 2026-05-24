"use client";

import { useState } from "react";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/features/plan-requests/ui/wizard-primitives";
import type { Gender } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Q7 — 생년월일 6자리 YYMMDD + 성별 chip.
 *
 * 사용자는 6자리 (예: 980504) 만 입력하고 세기는 "이미 지난 날짜만 허용" 규칙
 * 으로 자동 추론. 보통의 주민번호 인지 모델 (앞 6자리 = 생년월일) 과 정확히
 * 같아 입력 부담이 낮다.
 *
 * 세기 추론: 현재 연도의 마지막 두 자리 (`thisYY`) 와 비교
 *   - YY > thisYY → 1900s (예 2026 기준: 980504 → 1998-05-04)
 *   - YY ≤ thisYY → 2000s (예 2026 기준: 250504 → 2025-05-04)
 * 100세 초과는 사실상 사용자 풀에 없으므로 무시 — 1928년생을 1928 입력으로
 * 표현하면 2028년(미래) 으로 잡혀 reject 되니, 사실상 1927~현재 + 2000~현재
 * 범위만 통과.
 *
 * onSubmit 시그니처는 (YYYY-MM-DD, gender) — chatbot-shell 의 deriveRrnFields
 * 와 그대로 정합. 위젯 안에서 6자리 → 변환까지 책임.
 */
export function BirthdateGenderInput({
  onSubmit,
}: {
  onSubmit: (birthDate: string, gender: Gender) => void;
}) {
  const [yymmdd, setYymmdd] = useState("");
  const [gender, setGender] = useState<Gender | undefined>();

  const birthDate = toBirthDate(yymmdd);
  const valid = birthDate !== null && gender !== undefined;

  function handleSubmit() {
    if (!birthDate || !gender) return;
    onSubmit(birthDate, gender);
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="tel"
        inputMode="numeric"
        placeholder="예: 980504"
        maxLength={6}
        value={yymmdd}
        onChange={(e) =>
          setYymmdd(e.target.value.replace(/\D/g, "").slice(0, 6))
        }
        // step1-wizard / confirm-wizard 와 동일 height (h-14) — 숫자 입력이라 tracking 살짝 줘 가독성.
        className={cn(
          "h-14 px-4 text-sm tracking-[0.2em]",
          NO_TRACK_CLASS,
        )}
        aria-label="생년월일 6자리"
        autoComplete="off"
      />
      <div className="flex gap-2">
        <Chip selected={gender === "male"} onClick={() => setGender("male")}>
          남성
        </Chip>
        <Chip
          selected={gender === "female"}
          onClick={() => setGender("female")}
        >
          여성
        </Chip>
      </div>
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!valid}
        className="h-14 w-full rounded-full text-sm font-medium"
      >
        확인
      </Button>
    </div>
  );
}

/**
 * 6자리 YYMMDD → YYYY-MM-DD. 세기는 위 모듈 헤더의 "이미 지난 날짜만 허용"
 * 규칙으로 추론. 캘린더 overflow (02/30 등) / 미래 날짜는 null.
 */
function toBirthDate(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const now = new Date();
  const thisYY = now.getUTCFullYear() % 100;
  const century = yy > thisYY ? 1900 : 2000;
  const year = century + yy;

  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== mm - 1 ||
    d.getUTCDate() !== dd
  ) {
    return null;
  }
  if (d.getTime() > now.getTime()) return null;

  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

