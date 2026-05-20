"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  requestPdfUpload,
  submitProposal,
} from "@/features/plan-proposals/actions";
import {
  FOCUSED_CONCERN_LABEL,
  TREATMENT_PERIOD_LABEL,
  type CoverageRequest,
  type PlanRequest,
  type MedicalHistoryEntry,
} from "@/features/plan-requests/schema";
import { cn } from "@/lib/utils";
import { GENDER_LABEL } from "@/types";

const NOTE_MAX = 100;
const PDF_MIME = "application/pdf";

type Phase = "idle" | "presigning" | "uploading" | "submitting";

type FieldErrors = {
  _form?: string;
  note?: string;
  pdfS3Key?: string;
};

/**
 * 설계사 제안서 작성 폼 — 2-step S3 업로드.
 *
 * 화면 흐름:
 *   1. 데드라인 카운트다운 + 가입자 컨텍스트
 *   2. 설계 한줄 요약 (100자, 인사말 제외)
 *   3. 제안서 PDF 첨부 (진설계만)
 *   4. 제출 CTA
 *
 * 제출 클릭 → presign → S3 직접 PUT → submitProposal action. PDF 바이트는 우리
 * 함수를 거치지 않음 (Vercel body 한도 회피 + 메모리 효율).
 *
 * 휴대폰 번호는 노출하지 않음 — 가입자 PII 는 결과 화면의 "문자 받기" 통해 platform 이 relay.
 */
export function PlanProposalForm({
  token,
  partnerName,
  remainingMs,
  request,
}: {
  token: string;
  partnerName: string;
  remainingMs: number | null;
  request: PlanRequest;
}) {
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [, startTransition] = useTransition();

  const pending = phase !== "idle";
  const disabled = pending || !file || note.trim().length === 0;

  function busyLabel(): string {
    if (phase === "presigning") return "업로드 준비 중...";
    if (phase === "uploading") return "PDF 업로드 중...";
    if (phase === "submitting") return "제출 중...";
    return "제안서 제출";
  }

  async function handleSubmit() {
    if (!file) {
      setErrors({ pdfS3Key: "제안서 PDF를 첨부해주세요." });
      return;
    }
    if (note.trim().length === 0) {
      setErrors({ note: "설계 한줄 요약을 작성해주세요." });
      return;
    }
    setErrors({});

    startTransition(async () => {
      // 1. presign
      setPhase("presigning");
      const presign = await requestPdfUpload(token);
      if (!presign?.ok) {
        setPhase("idle");
        setErrors({ _form: presign?.errors?._form?.[0] ?? "업로드 준비 실패" });
        return;
      }

      // 2. S3 PUT — 클라가 직접
      setPhase("uploading");
      try {
        const putRes = await fetch(presign.url, {
          method: "PUT",
          headers: { "Content-Type": PDF_MIME },
          body: file,
        });
        if (!putRes.ok) {
          setPhase("idle");
          setErrors({ pdfS3Key: "PDF 업로드에 실패했어요. 다시 시도해주세요." });
          return;
        }
      } catch {
        setPhase("idle");
        setErrors({ pdfS3Key: "PDF 업로드에 실패했어요. 다시 시도해주세요." });
        return;
      }

      // 3. submit — server HEAD 검증 + DB insert
      setPhase("submitting");
      const result = await submitProposal(token, {
        pdfS3Key: presign.s3Key,
        note,
      });
      // ok=true 면 server 가 redirect 하므로 여기 도달 안 함.
      if (result && "errors" in result && result.errors) {
        setPhase("idle");
        setErrors({
          _form: result.errors._form?.[0],
          note: result.errors.note?.[0],
          pdfS3Key: result.errors.pdfS3Key?.[0],
        });
      }
    });
  }

  return (
    <main className="flex flex-col flex-1 px-6 pt-6 pb-8 bg-white">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
          {partnerName} 설계사님
          <br />새 제안서 요청이 도착했어요
        </h1>
        {remainingMs !== null && <DeadlineBadge initialMs={remainingMs} />}
      </header>

      <CustomerContext request={request} />

      <div className="mt-8 flex flex-col gap-6">
        <Section
          title="설계 한줄 요약"
          hint="인사말은 빼고 어떤 점에 집중해서 설계했는지 100자 이내로 알려주세요. 가입자 결과 페이지 상단에 그대로 노출됩니다."
        >
          <NoteInput
            value={note}
            onChange={setNote}
            maxLength={NOTE_MAX}
            disabled={pending}
          />
          {errors.note && <p className="text-xs text-red-600">{errors.note}</p>}
        </Section>

        <Section title="제안서 PDF" hint="가설계는 받지 않습니다.">
          <FileInput
            file={file}
            onChange={setFile}
            accept={PDF_MIME}
            disabled={pending}
          />
          {errors.pdfS3Key && (
            <p className="text-xs text-red-600">{errors.pdfS3Key}</p>
          )}
        </Section>

        {errors._form && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {errors._form}
          </p>
        )}

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={disabled}
          className="w-full h-14 rounded-full text-base font-medium"
        >
          {busyLabel()}
        </Button>

        <p className="text-center text-xs text-[#afafaf]">
          제출 후에는 수정할 수 없어요
        </p>
      </div>
    </main>
  );
}

/* ============================================================
 * 데드라인 배지 — 클라이언트에서 초 단위로 카운트다운
 * ============================================================ */

function DeadlineBadge({ initialMs }: { initialMs: number }) {
  const [remaining, setRemaining] = useState(initialMs);

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [remaining]);

  const totalMin = Math.floor(remaining / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const urgent = remaining < 6 * 3600 * 1000; // 6h 이하 긴급

  const label =
    remaining <= 0
      ? "마감됨"
      : hours > 0
        ? `${hours}시간 ${minutes}분 남았어요`
        : `${minutes}분 남았어요`;

  return (
    <div
      className={cn(
        "mt-1 inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full text-xs font-medium",
        urgent
          ? "bg-black text-white"
          : "bg-[#efefef] text-black",
      )}
    >
      <ClockIcon />
      <span>{label}</span>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/* ============================================================
 * 가입자 컨텍스트 — 휴대폰만 가린 가입자 요청 요약.
 * ============================================================ */

function CustomerContext({ request }: { request: PlanRequest }) {
  const { step1, step3, gender } = request;
  const budgetLabel = `${formatBudget(step1.monthlyBudgetMin)}~${formatBudget(step1.monthlyBudgetMax)}`;
  // 설계사가 보는 시점은 dispatched 이후라 step3 + gender 가 항상 존재. 방어적 fallback.
  const customerName = step3?.name ?? "이름 미상";

  return (
    <section className="mt-6 rounded-xl border border-[#e2e2e2] p-5 flex flex-col gap-4">
      <p className="text-xs font-medium tracking-wide text-[#4b4b4b]">
        가입자 요청
      </p>

      <div className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-black">{customerName}</h3>
        <p className="text-sm text-[#4b4b4b]">
          {gender ? GENDER_LABEL[gender] : "—"} · {step1.occupation}
        </p>
      </div>

      <div className="h-px bg-[#efefef]" />

      <dl className="grid grid-cols-1 gap-y-3 text-sm">
        <Meta label="월 예상 보험료" value={budgetLabel} />
      </dl>

      <CoverageDisplay coverage={step1.coverage} />

      <MedicalHistorySection entries={step1.medicalHistory} />

      {step1.additionalNotes && (
        <ContextNote label="추가 요청사항" body={step1.additionalNotes} />
      )}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[11px] text-[#afafaf]">{label}</dt>
      <dd className="text-sm font-medium text-black truncate">{value}</dd>
    </div>
  );
}

function ContextNote({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2.5">
      <p className="text-[11px] text-[#afafaf]">{label}</p>
      <p className="mt-1 text-sm text-[#4b4b4b] leading-relaxed whitespace-pre-wrap">
        {body}
      </p>
    </div>
  );
}

/**
 * 가입자가 요청서에 적은 "대비하고 싶은 보장" 표시.
 *  - broad : 한 줄 안내
 *  - focused: 선택한 concern chip 들
 */
function CoverageDisplay({ coverage }: { coverage: CoverageRequest }) {
  if (coverage.intent === "broad") {
    return (
      <ContextNote
        label="대비하고 싶은 보장"
        body="종합적으로 알아보고 있어요"
      />
    );
  }

  return (
    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2.5 flex flex-col gap-2">
      <p className="text-[11px] text-[#afafaf]">대비하고 싶은 보장</p>
      <ul className="flex flex-wrap gap-1.5">
        {coverage.concerns.map((id) => (
          <li
            key={id}
            className="px-2.5 py-1 rounded-full bg-white border border-[#e2e2e2] text-xs font-medium text-black"
          >
            {FOCUSED_CONCERN_LABEL[id]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MedicalHistorySection({
  entries,
}: {
  entries: MedicalHistoryEntry[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-[#afafaf]">
        병력 {entries.length > 0 ? `(${entries.length}건)` : ""}
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-[#4b4b4b]">병력 없음</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e, i) => (
            <li
              key={i}
              className="rounded-lg bg-[#f8f8f8] px-3 py-2.5 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-black">
                  {e.diagnosis}
                </span>
                <span className="text-[11px] text-[#4b4b4b] whitespace-nowrap">
                  {TREATMENT_PERIOD_LABEL[e.treatmentPeriod]} ·{" "}
                  {e.treatmentStartDate}
                </span>
              </div>
              <p className="text-xs text-[#4b4b4b]">
                입원 {e.hospitalizationDays}일 · 외래 {e.outpatientVisits}회 ·{" "}
                {e.hadSurgery ? "수술 있음" : "수술 없음"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ============================================================
 * 폼 primitives
 * ============================================================ */

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-bold text-black tracking-tight">{title}</h2>
        {hint && (
          <p className="text-xs text-[#4b4b4b] leading-relaxed">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * 한줄 요약 입력 — 100자 카운터 + 인사말 금지 안내.
 * 가입자 결과 페이지 상단 말풍선에 그대로 표시되므로 인사말/자기소개 제외, 설계 의도만.
 */
function NoteInput({
  value,
  onChange,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  disabled?: boolean;
}) {
  const remaining = maxLength - value.length;
  const nearLimit = remaining <= 10;

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        rows={3}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="예: 가장 걱정되시는 암 보장에 집중했어요. 30대에 가입하시면 평생 같은 보험료라 부담이 적답니다."
        className="w-full px-4 py-3 text-sm rounded-lg border border-black resize-none focus:outline-none focus:ring-2 focus:ring-black/10 leading-relaxed disabled:opacity-60"
      />
      <p
        className={cn(
          "self-end text-xs tabular-nums",
          nearLimit ? "text-black font-medium" : "text-[#afafaf]",
        )}
      >
        {value.length} / {maxLength}
      </p>
    </div>
  );
}

function FileInput({
  file,
  onChange,
  accept,
  disabled,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  accept: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="shrink-0 h-12 px-5 rounded-full text-sm font-medium bg-[#efefef] text-black hover:bg-[#e2e2e2] transition-colors disabled:opacity-60"
      >
        파일 선택
      </button>
      <span
        className={cn(
          "text-sm truncate",
          file ? "text-black font-medium" : "text-[#afafaf]",
        )}
      >
        {file ? file.name : "선택된 파일이 없어요"}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          onChange(f ?? null);
        }}
      />
    </div>
  );
}

/* ============================================================
 * formatters
 * ============================================================ */

function formatBudget(n: number): string {
  if (n >= 10000) {
    const man = n / 10000;
    return Number.isInteger(man) ? `${man}만원` : `${man.toFixed(1)}만원`;
  }
  return `${n.toLocaleString("ko-KR")}원`;
}
