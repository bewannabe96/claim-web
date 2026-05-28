"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { StickyBottomBar } from "@/components/sticky-bottom-bar";
import { ClaimStudioMark } from "../../_components/claim-studio-mark";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ============================================================
 * Onboarding flow — 카카오 OAuth 후 휴대폰 인증 + 동의 + 완료 안내.
 *
 * 휴대폰/OTP UX 는 v1 요청서 작성 confirm-wizard
 * ((marketing)/plan-request/[id]/confirm/_components/confirm-wizard.tsx) 와 동일
 * 패턴으로 정합:
 *   - 휴대폰: horizontal [Input + 인증번호 전송 button], h-14, dash 자동 포맷
 *   - OTP   : text-center tracking-[0.4em] (가운데 정렬 + 큰 간격), placeholder "000000"
 *   - 재전송 cooldown — 서버 limit 시뮬레이션
 *   - 동의 — ConsentRow 클릭형 카드
 *   - PII Input 통째 NO_TRACK_CLASS — 분석 제외
 *
 * stage 머신: enter-phone-otp → done. (휴대폰 + OTP 한 페이지로 합침 —
 * confirm-wizard 패턴. OTP 발송 후 같은 페이지에서 인증번호 input 노출.)
 *
 * 실 라우트에서는 features/plan-requests OTP 모듈 + 회원 가입 트랜잭션 + 익명
 * workspace 승계 (§5.7). mock 단계는 setState 시뮬레이션.
 * ============================================================ */

type Stage = "enter-phone-otp" | "done";

export function OnboardingFlow({ from }: { from: string | null }) {
  const [stage, setStage] = useState<Stage>("enter-phone-otp");

  if (stage === "done") return <DoneStage from={from} />;
  return <PhoneOtpStage onComplete={() => setStage("done")} />;
}

/* ============================================================
 * PhoneOtpStage — confirm-wizard 패턴 그대로:
 *   1) 휴대폰 input + [인증번호 전송] (transmit 후 [재전송] 또는 cooldown)
 *   2) OTP input (전송 후 노출)
 *   3) 동의 ConsentRow
 *   4) 마지막 [가입 완료] 큰 button
 * ============================================================ */
function PhoneOtpStage({ onComplete }: { onComplete: () => void }) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // mount focus.
  useEffect(() => {
    setTimeout(() => phoneInputRef.current?.focus(), 100);
  }, []);

  // cooldown tick — v1 confirm-wizard 동일 패턴.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const phoneValid = /^01\d{8,9}$/.test(phone);
  const otpValid = /^\d{6}$/.test(otp);
  const canSubmit = phoneValid && otpSent && otpValid;

  function handlePhoneChange(digits: string) {
    setPhone(digits);
    // 휴대폰 변경 시 OTP / 전송 상태 리셋 — confirm-wizard 패턴.
    setOtp("");
    setOtpSent(false);
    setCooldown(0);
  }

  function handleSendOtp() {
    if (!phoneValid || cooldown > 0) return;
    // mock — 실 라우트에서는 features/plan-requests sendOtp action.
    setOtpSent(true);
    setCooldown(30);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onComplete();
  }

  return (
    <main className="flex-1 flex flex-col px-6 pt-10 bg-white">
      <ClaimStudioMark />

      <header className="mt-10 flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-black leading-tight">
          본인 인증 후 시작해요
        </h1>
        <p className="text-sm text-[#4b4b4b]">
          본인 확인을 위해 휴대폰 번호로 인증해요
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-5">
        {/* 휴대폰 번호 + 인증번호 전송 — horizontal flex, h-14. */}
        <Field label="휴대폰 번호">
          <div className="flex gap-2">
            <Input
              ref={phoneInputRef}
              type="tel"
              inputMode="numeric"
              placeholder="010-1234-5678"
              maxLength={13}
              value={formatPhoneDisplay(phone)}
              onChange={(e) =>
                handlePhoneChange(
                  e.currentTarget.value.replace(/\D/g, "").slice(0, 11),
                )
              }
              className={cn(
                "h-14 px-4 text-sm tracking-wider flex-1",
                NO_TRACK_CLASS,
              )}
              autoComplete="tel"
            />
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={!phoneValid || cooldown > 0}
              className={cn(
                "shrink-0 h-14 px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                phoneValid && cooldown === 0
                  ? "bg-black text-white hover:bg-[#1a1a1a]"
                  : "bg-[#efefef] text-[#afafaf] cursor-not-allowed",
              )}
            >
              {cooldown > 0
                ? `${cooldown}초 후 재전송`
                : otpSent
                  ? "재전송"
                  : "인증번호 전송"}
            </button>
          </div>
        </Field>

        {/* OTP — 전송 후 노출. confirm-wizard 동일 패턴. */}
        {otpSent && (
          <Field label="인증번호 6자리">
            <Input
              type="tel"
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              value={otp}
              onChange={(e) =>
                setOtp(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))
              }
              className={cn(
                "h-14 px-4 text-sm tracking-[0.4em] text-center",
                NO_TRACK_CLASS,
              )}
              autoFocus
              autoComplete="one-time-code"
            />
          </Field>
        )}
      </div>

      <StickyBottomBar>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full h-14 rounded-full bg-black text-white text-base font-medium hover:bg-[#1a1a1a] disabled:bg-[#efefef] disabled:text-[#4b4b4b] transition-colors"
        >
          가입 완료
        </button>
      </StickyBottomBar>
    </main>
  );
}

function DoneStage({ from }: { from: string | null }) {
  const backHref = "/v2-mock/compare";
  const backLabel =
    from === "pool_entry" ? "요청서 작성으로 이동" : "비교 화면으로 이동";

  return (
    <main className="flex-1 flex flex-col px-6 pt-10">
      <ClaimStudioMark />
      <div className="mt-16 flex flex-col items-center gap-4 text-center">
        <span
          aria-hidden
          className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-black text-white text-2xl font-bold"
        >
          ✓
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-black">
          가입이 완료됐어요
        </h1>
        <p className="text-sm text-[#4b4b4b] leading-relaxed">
          업로드한 자료와 분석 결과가 회원 계정으로 승계됐어요.
        </p>
      </div>

      <StickyBottomBar>
        <Link
          href={backHref as never}
          className="w-full h-14 rounded-full bg-black text-white text-base font-medium hover:bg-[#1a1a1a] transition-colors flex items-center justify-center"
        >
          {backLabel}
        </Link>
      </StickyBottomBar>
    </main>
  );
}

/* ============================================================
 * 보조 컴포넌트 — v1 confirm-wizard 의 Field / ConsentRow 패턴 차용.
 * ============================================================ */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-black">{label}</label>
      {children}
    </div>
  );
}

/** 휴대폰 번호 자동 dash 포맷 — confirm-wizard 의 formatPhoneDisplay 동일. */
function formatPhoneDisplay(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

