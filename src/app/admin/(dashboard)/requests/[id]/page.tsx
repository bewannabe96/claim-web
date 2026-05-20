import { notFound } from "next/navigation";

import { getPartnerCardsByIds } from "@/features/partners/queries";
import type { PartnerCard } from "@/features/partners/schema";
import { listAssignmentDetailsForRequest } from "@/features/plan-proposals/queries";
import {
  type AnalysisError,
  type AssignmentStatus,
  type PlanProposal,
} from "@/features/plan-proposals/schema";
import { getRequestById } from "@/features/plan-requests/queries";
import {
  TREATMENT_PERIOD_LABEL,
  coverageRequestToText,
  type MedicalHistoryEntry,
} from "@/features/plan-requests/schema";
import { RequestStatusBadge } from "@/features/plan-requests/ui/status-badge";
import { cn } from "@/lib/utils";
import { GENDER_LABEL } from "@/types";

import { AnalysisErrorPill } from "../../_components/analysis-error-pill";
import {
  BackLink,
  Card,
  CardHeader,
  PageHeader,
} from "../../_components/page-shell";
import { RetryAnalysisButton } from "../../_components/retry-analysis-button";

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await getRequestById(id);
  if (!request) notFound();

  const details = await listAssignmentDetailsForRequest(id);
  const candidatePartners = await getPartnerCardsByIds(
    request.candidatePartnerIds,
  );
  const selectedSet = new Set(request.selectedPartnerIds);
  const submittedCount = details.filter(
    (d) => d.assignment.status === "submitted",
  ).length;
  const analyzedCount = details.filter(
    (d) => d.proposal?.analyzedAt != null,
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackLink href="/admin/requests">요청 목록</BackLink>
        <PageHeader
          title={
            <span className="inline-flex items-center gap-3">
              {id}
              <RequestStatusBadge status={request.status} />
            </span>
          }
          description={`생성 ${formatDateTime(request.createdAt)}${
            request.dispatchedAt
              ? ` · 송부 ${formatDateTime(request.dispatchedAt)}`
              : ""
          }${
            request.deadlineAt
              ? ` · 마감 ${formatDateTime(request.deadlineAt)}`
              : ""
          }`}
        />
      </div>

      {/* 요청서 — Step1 (제안서 정보) + Step3 (본인 식별) */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader title="기본 정보" />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="성별">
              {request.gender ? GENDER_LABEL[request.gender] : "—"}
            </Field>
            <Field label="직업">{request.step1.occupation}</Field>
            <Field label="월 예상 보험료" wide>
              {request.step1.monthlyBudgetMin.toLocaleString("ko-KR")}원 ~{" "}
              {request.step1.monthlyBudgetMax.toLocaleString("ko-KR")}원
            </Field>
          </dl>
        </Card>

        <Card>
          <CardHeader title="본인 인증 / 동의" />
          {request.step3 ? (
            <dl className="grid grid-cols-1 gap-y-4">
              <Field label="이름">{request.step3.name}</Field>
              <Field label="휴대폰">{formatPhone(request.step3.phone)}</Field>
              <Field label="제3자 정보 제공 동의">
                {request.step3.consentThirdParty === "on" ? "동의" : "—"}
              </Field>
              <Field label="알림톡 수신 동의">
                {request.step3.consentMessaging === "on" ? "동의" : "—"}
              </Field>
            </dl>
          ) : (
            <p className="text-sm text-[#afafaf]">아직 본인 인증 전</p>
          )}
        </Card>
      </div>

      {/* 희망 담보 + 추가 요청사항 */}
      <Card>
        <CardHeader title="희망 담보 / 추가 요청사항" />
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs text-[#afafaf] mb-1.5">희망하시는 담보</p>
            <p className="text-sm text-black leading-relaxed whitespace-pre-wrap">
              {coverageRequestToText(request.step1.coverage)}
            </p>
          </div>
          {request.step1.additionalNotes && (
            <div>
              <p className="text-xs text-[#afafaf] mb-1.5">추가 요청사항</p>
              <p className="text-sm text-[#4b4b4b] leading-relaxed whitespace-pre-wrap">
                {request.step1.additionalNotes}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* 병력 */}
      <Card>
        <CardHeader
          title="병력"
          meta={
            request.step1.medicalHistory.length > 0
              ? `${request.step1.medicalHistory.length}건`
              : "없음"
          }
        />
        {request.step1.medicalHistory.length === 0 ? (
          <p className="text-sm text-[#afafaf]">병력 없음</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {request.step1.medicalHistory.map((e, i) => (
              <MedicalRow key={i} entry={e} />
            ))}
          </ul>
        )}
      </Card>

      {/* 후보 / 선택 */}
      <Card>
        <CardHeader
          title="후보 & 선택"
          meta={
            <>
              후보{" "}
              <span className="font-semibold text-black">
                {request.candidatePartnerIds.length}명
              </span>{" "}
              · 선택{" "}
              <span className="font-semibold text-black">
                {request.selectedPartnerIds.length}명
              </span>
            </>
          }
        />
        {candidatePartners.length === 0 ? (
          <p className="text-sm text-[#afafaf]">아직 후보가 없어요</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5">
            {candidatePartners.map((p) => (
              <PartnerProfileCard
                key={p.id}
                partner={p}
                selected={selectedSet.has(p.id)}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* Assignment 별 제안서 현황 */}
      <Card>
        <CardHeader
          title="설계사별 제출 현황"
          meta={
            <>
              제출{" "}
              <span className="font-semibold text-black">{submittedCount}</span>
              <span className="text-[#4b4b4b]">/{details.length}</span>
              <span className="mx-1.5 text-[#e2e2e2]">·</span>
              분석{" "}
              <span className="font-semibold text-black">{analyzedCount}</span>
              <span className="text-[#4b4b4b]">/{submittedCount}</span>
            </>
          }
        />
        {details.length === 0 ? (
          <p className="text-sm text-[#afafaf]">
            아직 송부된 assignment 가 없어요
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#efefef]">
            {details.map((d) => (
              <AssignmentItem key={d.assignment.id} detail={d} />
            ))}
          </ul>
        )}
      </Card>

      {/* 결과 토큰 */}
      {request.resultToken && (
        <Card>
          <CardHeader title="결과 페이지" />
          <p className="text-sm text-[#4b4b4b]">
            가입자가 알림톡으로 받는 결과 화면 (운영자도 동일 URL 로 검토 가능):
          </p>
          <a
            href={`/plan-request/result/${request.resultToken}`}
            target="_blank"
            rel="noopener noreferrer"
            title="새 탭에서 열기 — 가입자 POV"
            className="mt-2 block px-3 py-2 rounded-lg bg-[#fafafa] text-xs text-black break-all hover:bg-[#efefef] transition-colors"
          >
            /plan-request/result/{request.resultToken}
          </a>
        </Card>
      )}
    </div>
  );
}

/* ============================================================
 * 보조 컴포넌트
 * ============================================================ */

function MedicalRow({ entry }: { entry: MedicalHistoryEntry }) {
  return (
    <li className="rounded-lg border border-[#efefef] bg-white px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-black">{entry.diagnosis}</span>
        <span className="text-xs text-[#4b4b4b] whitespace-nowrap">
          {TREATMENT_PERIOD_LABEL[entry.treatmentPeriod]} ·{" "}
          {entry.treatmentStartDate}
        </span>
      </div>
      <p className="text-xs text-[#4b4b4b]">
        입원{" "}
        <span className="font-medium text-black">
          {entry.hospitalizationDays}일
        </span>{" "}
        · 외래{" "}
        <span className="font-medium text-black">
          {entry.outpatientVisits}회
        </span>{" "}
        ·{" "}
        <span className="font-medium text-black">
          {entry.hadSurgery ? "수술 있음" : "수술 없음"}
        </span>
      </p>
    </li>
  );
}

function PartnerProfileCard({
  partner,
  selected,
}: {
  partner: PartnerCard;
  selected: boolean;
}) {
  const initial = partner.name.charAt(0);
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-3.5 py-3 rounded-xl border",
        selected
          ? "border-black bg-black/[0.02]"
          : "border-[#efefef] bg-white",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold shrink-0",
          selected ? "bg-black text-white" : "bg-[#efefef] text-[#4b4b4b]",
        )}
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-black truncate">
            {partner.name}
          </span>
          <span className="text-[11px] text-[#4b4b4b]">
            경력 {partner.yearsOfExperience}년
          </span>
          {selected && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-black text-white">
              선택
            </span>
          )}
          {partner.isNew && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-[#e2e2e2] bg-white text-[#4b4b4b]">
              신규
            </span>
          )}
        </div>
        <p className="text-xs text-[#4b4b4b] leading-snug line-clamp-2">
          {partner.bio}
        </p>
        <p className="text-[11px] text-[#afafaf] truncate">
          {partner.trustMetric}
        </p>
      </div>
    </li>
  );
}

function AssignmentItem({
  detail,
}: {
  detail: Awaited<ReturnType<typeof listAssignmentDetailsForRequest>>[number];
}) {
  const { assignment, partner, proposal } = detail;
  const initial = partner.name.charAt(0);

  return (
    <li className="py-4 flex items-start gap-4">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-black text-white text-sm font-bold shrink-0">
        {initial}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-black">{partner.name}</span>
          <span className="text-xs text-[#4b4b4b]">
            경력 {partner.yearsOfExperience}년
          </span>
          <AssignmentStatusPill status={assignment.status} />
          {proposal && <AnalysisStatusPill proposal={proposal} />}
        </div>

        {proposal ? (
          <div className="flex flex-col gap-1.5 text-xs text-[#4b4b4b]">
            <Spec label="PDF" value={pdfBasename(proposal.pdfS3Key)} />
            <Spec label="한줄 요약" value={proposal.note} />
            {/* 분석 실패 상태 — analyzedAt 이 없고 analysisError 가 있을 때만 노출.
                성공이 들어오면 자연스럽게 사라짐. */}
            {!proposal.analyzedAt && proposal.analysisError && (
              <AnalysisFailureBlock
                proposalId={proposal.id}
                error={proposal.analysisError}
                erroredAt={proposal.analysisErrorAt}
              />
            )}
          </div>
        ) : (
          <p className="text-xs text-[#afafaf]">
            {assignment.status === "pending"
              ? "응답 대기 중"
              : assignment.status === "expired"
                ? "마감 시각까지 미제출"
                : "—"}
          </p>
        )}

        <a
          href={`/partner/plan-request-assignments/${assignment.token}`}
          target="_blank"
          rel="noopener noreferrer"
          title="새 탭에서 열기 — 설계사 POV"
          className="block px-3 py-2 rounded-lg bg-[#fafafa] text-xs text-black break-all hover:bg-[#efefef] transition-colors"
        >
          /partner/plan-request-assignments/{assignment.token}
        </a>
      </div>

      <div className="shrink-0 text-right text-xs text-[#4b4b4b] whitespace-nowrap flex flex-col gap-0.5">
        {assignment.submittedAt ? (
          <span>제출 {formatDateTime(assignment.submittedAt)}</span>
        ) : (
          <span>송부 {formatDateTime(assignment.createdAt)}</span>
        )}
        {proposal?.analyzedAt && (
          <span className="text-[#afafaf]">
            분석 {formatDateTime(proposal.analyzedAt)}
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * proposal 의 분석 상태 pill (우선순위: 성공 > 실패 > 진행 중).
 *   - analyzedAt 있음           → "분석 완료" (검정)
 *   - analysisError 있음         → group 별 색상의 실패 pill
 *   - 둘 다 없음                 → "분석 중" (회색 + pulse)
 */
function AnalysisStatusPill({ proposal }: { proposal: PlanProposal }) {
  if (proposal.analyzedAt) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-black text-white">
        분석 완료
      </span>
    );
  }
  if (proposal.analysisError) {
    return <AnalysisErrorPill group={proposal.analysisError.group} />;
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-[#e2e2e2] bg-white text-[#4b4b4b]">
      <span
        className="w-1 h-1 rounded-full bg-[#4b4b4b] animate-pulse"
        aria-hidden
      />
      분석 중
    </span>
  );
}

/**
 * 실패 상세 + 재시도 버튼. type/message 와 (있으면) detail JSON 토글 + 재시도 액션.
 * 어드민 "분석 실패" 페이지의 카드와 같은 정보를 행 내부에 인라인으로 노출.
 */
function AnalysisFailureBlock({
  proposalId,
  error,
  erroredAt,
}: {
  proposalId: string;
  error: AnalysisError;
  erroredAt: string | undefined;
}) {
  return (
    <div className="mt-1 rounded-lg border border-[#fcd34d] bg-[#fffbeb] px-3 py-2.5 flex flex-col gap-2">
      <div className="flex flex-col gap-1 text-xs text-black">
        <div>
          <span className="text-[#92400e] font-mono">{error.type}</span>
          {erroredAt && (
            <span className="ml-2 text-[#afafaf]">
              {formatDateTime(erroredAt)}
            </span>
          )}
        </div>
        <p>{error.message}</p>
      </div>
      {error.detail && (
        <details className="rounded border border-[#fcd34d] bg-white/60 px-2 py-1.5">
          <summary className="cursor-pointer text-[11px] text-[#92400e]">
            detail
          </summary>
          <pre className="mt-1.5 text-[10px] text-black whitespace-pre-wrap break-all">
            {JSON.stringify(error.detail, null, 2)}
          </pre>
        </details>
      )}
      <div className="flex justify-end">
        <RetryAnalysisButton proposalId={proposalId} size="sm" />
      </div>
    </div>
  );
}

function AssignmentStatusPill({ status }: { status: AssignmentStatus }) {
  const map: Record<AssignmentStatus, { label: string; className: string }> = {
    pending: {
      label: "대기",
      className: "bg-[#efefef] text-[#4b4b4b]",
    },
    submitted: {
      label: "제출",
      className: "bg-black text-white",
    },
    expired: {
      label: "미제출",
      className: "border border-[#e2e2e2] bg-white text-[#4b4b4b]",
    },
  };
  const { label, className } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
        className,
      )}
    >
      {label}
    </span>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", wide && "col-span-2")}>
      <dt className="text-xs text-[#afafaf]">{label}</dt>
      <dd className="text-sm text-black">{children}</dd>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <span className="truncate">
      <span className="text-[#afafaf]">{label}</span>{" "}
      <span className="font-medium text-black">{value}</span>
    </span>
  );
}

/** "proposals/<aid>/<nanoid>.pdf" → "<nanoid>.pdf". 어드민이 식별만 가능하면 충분. */
function pdfBasename(s3Key: string): string {
  const slash = s3Key.lastIndexOf("/");
  return slash >= 0 ? s3Key.slice(slash + 1) : s3Key;
}

function formatPhone(p: string): string {
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return p;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}.${dd} ${hh}:${mi}`;
}
