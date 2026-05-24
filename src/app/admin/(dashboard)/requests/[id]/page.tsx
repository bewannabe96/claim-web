import { notFound } from "next/navigation";

import { getPartnerCardsByIds } from "@/features/partners/queries";
import type { PartnerCard } from "@/features/partners/schema";
import { PartnerAvatar } from "@/features/partners/ui/partner-avatar";
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
import { nowMs } from "@/lib/wall-clock";
import { GENDER_LABEL } from "@/types";

import { formatDateTime, formatPhone } from "../../_lib/format";
import { AnalysisErrorPill } from "../../_components/analysis-error-pill";
import { ExtendDeadlineControl } from "../../_components/extend-deadline-control";
import {
  BackLink,
  Badge,
  Card,
  CardHeader,
  Field,
  PageHeader,
} from "../../_components/page-shell";
import { RetryAnalysisButton } from "../../_components/retry-analysis-button";
import { SendResultNotificationButton } from "../../_components/send-result-notification-button";

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

  const headerDescription = [
    `생성 ${formatDateTime(request.createdAt)}`,
    request.dispatchedAt && `송부 ${formatDateTime(request.dispatchedAt)}`,
    request.deadlineAt && `마감 ${formatDateTime(request.deadlineAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackLink href="/admin/requests">요청 목록</BackLink>
        <PageHeader
          title={
            <span className="inline-flex items-center gap-3 tabular-nums">
              {id}
              <RequestStatusBadge status={request.status} />
            </span>
          }
          description={headerDescription}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
          <CardHeader title="본인 인증" />
          {request.step3 ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="이름">{request.step3.name}</Field>
              <Field label="휴대폰">
                {request.step3.phone ? formatPhone(request.step3.phone) : "—"}
              </Field>
              <Field label="제3자 정보 제공">
                {request.step3.consentThirdParty === "on" ? "동의" : "—"}
              </Field>
              <Field label="알림톡 수신">
                {request.step3.consentMessaging === "on" ? "동의" : "—"}
              </Field>
            </dl>
          ) : (
            <p className="text-sm text-[#afafaf]">아직 본인 인증 전</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="희망 담보 · 추가 요청사항" />
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

      <Card>
        <CardHeader
          title="후보 · 선택"
          meta={
            <span className="tabular-nums">
              후보{" "}
              <span className="font-semibold text-black">
                {request.candidatePartnerIds.length}
              </span>{" "}
              · 선택{" "}
              <span className="font-semibold text-black">
                {request.selectedPartnerIds.length}
              </span>
            </span>
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

      <Card>
        <CardHeader
          title="파트너별 제출 현황"
          meta={
            <span className="tabular-nums">
              제출{" "}
              <span className="font-semibold text-black">{submittedCount}</span>
              <span className="text-[#afafaf]">/{details.length}</span>
              <span className="mx-2 text-[#e2e2e2]">·</span>
              분석{" "}
              <span className="font-semibold text-black">{analyzedCount}</span>
              <span className="text-[#afafaf]">/{submittedCount}</span>
            </span>
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

      {/* 연장은 마감 전에만 의미 있음 — 도과된 요청은 cron 이 곧 closePlanRequest
          로 expired/completed/rematching 전이할 transient 이라 카드 자체를 숨김.
          서버 액션도 같은 가드를 갖고 있어 race 가 나면 conflict/already_past 로
          반환됨. */}
      {request.deadlineAt &&
        (request.status === "dispatched" ||
          request.status === "analyzing") &&
        Date.parse(request.deadlineAt) > nowMs() && (
          <Card>
            <CardHeader
              title="제출 마감"
              meta={
                <span className="tabular-nums">
                  {formatDateTime(request.deadlineAt)}
                </span>
              }
            />
            <ExtendDeadlineControl
              planRequestId={id}
              currentDeadlineAt={request.deadlineAt}
            />
          </Card>
        )}

      {request.resultToken && (
        <Card>
          <CardHeader
            title="결과 페이지"
            meta={
              request.resultViewedAt
                ? `열람 ${formatDateTime(request.resultViewedAt)}`
                : "미열람"
            }
          />
          <div className="flex flex-col gap-3">
            <a
              href={`/plan-request/result/${request.resultToken}`}
              target="_blank"
              rel="noopener noreferrer"
              title="새 탭에서 열기 — 가입자 POV"
              className="block px-3 py-2 rounded-lg bg-[#fafafa] text-xs font-mono text-black break-all hover:bg-[#efefef] transition-colors"
            >
              /plan-request/result/{request.resultToken}
            </a>
            {request.status === "completed" && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[#efefef] px-3 py-2.5">
                <p className="text-xs text-[#4b4b4b]">
                  가입자에게 분석 완료 알림톡(결과 페이지 링크)을 발송해요.
                </p>
                <SendResultNotificationButton planRequestId={id} />
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function MedicalRow({ entry }: { entry: MedicalHistoryEntry }) {
  return (
    <li className="rounded-xl border border-[#efefef] bg-[#fafafa] px-4 py-3 flex flex-col gap-1.5">
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
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors",
        selected
          ? "border-black bg-black/[0.02]"
          : "border-[#efefef] bg-white",
      )}
    >
      <PartnerAvatar
        name={partner.name}
        avatarUrl={partner.avatarUrl}
        className="w-9 h-9 text-sm font-bold"
        fallbackClassName={
          selected ? "bg-black text-white" : "bg-[#efefef] text-[#4b4b4b]"
        }
      />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-black truncate">
            {partner.name}
          </span>
          <span className="text-[11px] text-[#afafaf]">
            {partner.yearsOfExperience}년
          </span>
          {selected && <Badge tone="solid">선택</Badge>}
          {partner.isNew && <Badge tone="outline">신규</Badge>}
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

  return (
    <li className="py-4 flex items-start gap-4">
      <PartnerAvatar
        name={partner.name}
        avatarUrl={partner.avatarUrl}
        className="w-10 h-10 text-sm font-bold"
        fallbackClassName="bg-black text-white"
      />

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-black">{partner.name}</span>
          <span className="text-[11px] text-[#afafaf]">
            {partner.yearsOfExperience}년
          </span>
          <AssignmentStatusPill status={assignment.status} />
          {proposal && <AnalysisStatusPill proposal={proposal} />}
        </div>

        {proposal ? (
          <div className="flex flex-col gap-1.5 text-xs text-[#4b4b4b]">
            <PdfDownloadRow
              proposalId={proposal.id}
              filename={pdfBasename(proposal.pdfS3Key)}
            />
            <Spec label="한줄 요약" value={proposal.note} />
            {!proposal.analyzedAt && proposal.analysisError && (
              <AnalysisFailureBlock
                proposalId={proposal.id}
                error={proposal.analysisError}
                erroredAt={proposal.analysisErrorAt}
              />
            )}
            {!proposal.analyzedAt && !proposal.analysisError && (
              <AnalysisPendingBlock proposalId={proposal.id} />
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
          title="새 탭에서 열기 — 파트너 POV"
          className="block px-3 py-2 rounded-lg bg-[#fafafa] text-xs font-mono text-black break-all hover:bg-[#efefef] transition-colors"
        >
          /partner/plan-request-assignments/{assignment.token}
        </a>
      </div>

      <div className="shrink-0 text-right text-xs text-[#4b4b4b] whitespace-nowrap flex flex-col gap-0.5 tabular-nums">
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
        {proposal?.contactRequestedAt && (
          <span className="text-black font-medium">
            상담요청 {formatDateTime(proposal.contactRequestedAt)}
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * proposal 의 분석 상태 pill (우선순위: 성공 > 실패 > 진행 중).
 */
function AnalysisStatusPill({ proposal }: { proposal: PlanProposal }) {
  if (proposal.analyzedAt) {
    return <Badge tone="solid">분석 완료</Badge>;
  }
  if (proposal.analysisError) {
    return <AnalysisErrorPill group={proposal.analysisError.group} />;
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-[#e2e2e2] bg-white text-[#4b4b4b] whitespace-nowrap">
      <span
        className="w-1 h-1 rounded-full bg-[#4b4b4b] animate-pulse"
        aria-hidden
      />
      분석 중
    </span>
  );
}

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
    <div className="mt-1 rounded-xl border border-[#fcd34d] bg-[#fffbeb] px-3 py-2.5 flex flex-col gap-2">
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

/**
 * 분석 응답이 오지 않고 정체된 proposal — 어드민이 수기로 재요청 트리거.
 * 외부 파이프라인이 실패 콜백조차 못 보낸 경우 "분석중" 이 영구 박히는 걸 풀기 위함.
 * 시간 임계값은 두지 않음 (사람이 보고 판단).
 */
function AnalysisPendingBlock({ proposalId }: { proposalId: string }) {
  return (
    <div className="mt-1 rounded-xl border border-[#efefef] bg-[#fafafa] px-3 py-2.5 flex items-center justify-between gap-3">
      <p className="text-xs text-[#4b4b4b]">
        분석 응답을 기다리는 중이에요. 비정상적으로 오래 걸리면 재요청해주세요.
      </p>
      <RetryAnalysisButton proposalId={proposalId} size="sm" />
    </div>
  );
}

function AssignmentStatusPill({ status }: { status: AssignmentStatus }) {
  if (status === "submitted") return <Badge tone="solid">제출</Badge>;
  if (status === "expired") return <Badge tone="outline">미제출</Badge>;
  return <Badge tone="neutral">대기</Badge>;
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <span className="truncate">
      <span className="text-[#afafaf]">{label}</span>{" "}
      <span className="font-medium text-black">{value}</span>
    </span>
  );
}

/**
 * PDF 식별 + 다운로드 anchor. href 는 `/admin/api/proposals/<id>/download` —
 * 어드민 트램펄린 라우트가 presigned GET URL 발급 + 302 redirect.
 *
 * `<a download>` 어트리뷰트는 cross-origin (S3) redirect 에선 무시되므로 파일명은
 * S3 측 `Content-Disposition` 으로 강제 (s3.ts `presignPlanProposalDownload`).
 */
function PdfDownloadRow({
  proposalId,
  filename,
}: {
  proposalId: string;
  filename: string;
}) {
  return (
    <span className="truncate">
      <span className="text-[#afafaf]">PDF</span>{" "}
      <a
        href={`/admin/api/proposals/${proposalId}/download`}
        className="font-medium text-black underline decoration-[#e2e2e2] underline-offset-2 hover:decoration-black"
        title="PDF 다운로드"
      >
        {filename}
      </a>
    </span>
  );
}

/** "proposals/<aid>/<nanoid>.pdf" → "<nanoid>.pdf". 어드민이 식별만 가능하면 충분. */
function pdfBasename(s3Key: string): string {
  const slash = s3Key.lastIndexOf("/");
  return slash >= 0 ? s3Key.slice(slash + 1) : s3Key;
}
