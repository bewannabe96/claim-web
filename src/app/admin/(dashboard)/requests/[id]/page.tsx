import { notFound } from "next/navigation";

import { listAssignmentDetailsForRequest } from "@/features/proposals/queries";
import { type AssignmentStatus } from "@/features/proposals/schema";
import { getRequestById } from "@/features/requests/queries";
import {
  TREATMENT_PERIOD_LABEL,
  coverageRequestToText,
  type MedicalHistoryEntry,
} from "@/features/requests/schema";
import { RequestStatusBadge } from "@/features/requests/ui/status-badge";
import { cn } from "@/lib/utils";
import { GENDER_LABEL } from "@/types";

import {
  BackLink,
  Card,
  CardHeader,
  PageHeader,
} from "../../_components/page-shell";

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await getRequestById(id);
  if (!request) notFound();

  const details = await listAssignmentDetailsForRequest(id);
  const submittedCount = details.filter(
    (d) => d.assignment.status === "submitted",
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
            <Field label="성별">{GENDER_LABEL[request.step1.gender]}</Field>
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
        <div className="flex flex-wrap gap-1.5">
          {request.candidatePartnerIds.map((aid) => {
            const selected = request.selectedPartnerIds.includes(aid);
            return (
              <span
                key={aid}
                className={cn(
                  "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium",
                  selected
                    ? "bg-black text-white"
                    : "bg-[#efefef] text-[#4b4b4b]",
                )}
              >
                {aid}
              </span>
            );
          })}
        </div>
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
          <code className="mt-2 block px-3 py-2 rounded-lg bg-[#fafafa] text-xs text-black break-all">
            /result/{request.resultToken}
          </code>
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-black">{partner.name}</span>
          <span className="text-xs text-[#4b4b4b]">
            경력 {partner.yearsOfExperience}년
          </span>
          <AssignmentStatusPill status={assignment.status} />
        </div>

        {proposal ? (
          <div className="flex flex-col gap-1.5 text-xs text-[#4b4b4b]">
            <Spec label="PDF" value={pdfBasename(proposal.pdfS3Key)} />
            <Spec label="한줄 요약" value={proposal.note} />
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
      </div>

      <div className="shrink-0 text-right text-xs text-[#4b4b4b] whitespace-nowrap">
        {assignment.submittedAt ? (
          <>제출 {formatDateTime(assignment.submittedAt)}</>
        ) : (
          <>송부 {formatDateTime(assignment.createdAt)}</>
        )}
      </div>
    </li>
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
