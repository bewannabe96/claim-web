import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { listAssignmentDetailsForRequest } from "@/features/proposals/queries";
import {
  REFUND_TYPE_LABEL,
  RENEWAL_TYPE_LABEL,
  type AssignmentStatus,
} from "@/features/proposals/schema";
import { getRequestById } from "@/features/requests/queries";
import { RequestStatusBadge } from "@/features/requests/ui/status-badge";
import { cn } from "@/lib/utils";
import {
  AGE_RANGE_LABEL,
  GENDER_LABEL,
  INSURANCE_CATEGORY_LABEL,
} from "@/types";

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
  await cookies();
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

      {/* 가입자 요청 정보 */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader title="요청서 (Step1)" />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="보장 분야">
              <div className="flex flex-wrap gap-1.5">
                {request.step1.categories.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#efefef] text-black"
                  >
                    {INSURANCE_CATEGORY_LABEL[c]}
                  </span>
                ))}
              </div>
            </Field>
            <Field label="연령대">
              {AGE_RANGE_LABEL[request.step1.ageRange]}
            </Field>
            <Field label="성별">{GENDER_LABEL[request.step1.gender]}</Field>
            <Field label="거주 지역">{request.step1.region}</Field>
            <Field label="월 예상 보험료" wide>
              {request.step1.monthlyBudgetMin.toLocaleString("ko-KR")}원 ~{" "}
              {request.step1.monthlyBudgetMax.toLocaleString("ko-KR")}원
            </Field>
          </dl>
        </Card>

        <Card>
          <CardHeader title="진설계 정보 (Step3)" />
          {request.step3 ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="생년월일">{request.step3.birthDate}</Field>
              <Field label="직업">{request.step3.occupation}</Field>
              <Field label="흡연">
                {request.step3.smoker ? "흡연" : "비흡연"}
              </Field>
              <Field label="키 / 몸무게">
                {request.step3.heightCm}cm · {request.step3.weightKg}kg
              </Field>
              <Field label="기존 보험">
                {request.step3.hasExistingInsurance ? "있음" : "없음"}
              </Field>
              <Field label="휴대폰">{formatPhone(request.step3.phone)}</Field>
              {request.step3.existingInsuranceNote && (
                <Field label="기존 보험 메모" wide>
                  <span className="text-[#4b4b4b] leading-relaxed">
                    {request.step3.existingInsuranceNote}
                  </span>
                </Field>
              )}
              {request.step3.medicalHistory && (
                <Field label="병력" wide>
                  <span className="text-[#4b4b4b] leading-relaxed">
                    {request.step3.medicalHistory}
                  </span>
                </Field>
              )}
            </dl>
          ) : (
            <p className="text-sm text-[#afafaf]">아직 입력 전</p>
          )}
        </Card>
      </div>

      {/* 후보 / 선택 */}
      <Card>
        <CardHeader
          title="후보 & 선택"
          meta={
            <>
              후보{" "}
              <span className="font-semibold text-black">
                {request.candidateAgentIds.length}명
              </span>{" "}
              · 선택{" "}
              <span className="font-semibold text-black">
                {request.selectedAgentIds.length}명
              </span>
            </>
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {request.candidateAgentIds.map((aid) => {
            const selected = request.selectedAgentIds.includes(aid);
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

      {/* Assignment 별 진설계 현황 */}
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

      {/* 결과 토큰 (가입자 결과 페이지 진입 링크) */}
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

function AssignmentItem({
  detail,
}: {
  detail: Awaited<ReturnType<typeof listAssignmentDetailsForRequest>>[number];
}) {
  const { assignment, agent, proposal } = detail;
  const initial = agent.name.charAt(0);

  return (
    <li className="py-4 flex items-start gap-4">
      {/* 아바타 */}
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-black text-white text-sm font-bold shrink-0">
        {initial}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-black">{agent.name}</span>
          <span className="text-xs text-[#4b4b4b]">
            경력 {agent.yearsOfExperience}년
          </span>
          <AssignmentStatusPill status={assignment.status} />
        </div>

        {proposal ? (
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-[#4b4b4b]">
            <Spec
              label="월 보험료"
              value={`${proposal.monthlyPremium.toLocaleString("ko-KR")}원`}
            />
            <Spec
              label="총 보장"
              value={`${proposal.totalCoverage.toLocaleString("ko-KR")}원`}
            />
            <Spec label="납입" value={`${proposal.paymentYears}년`} />
            <Spec label="갱신" value={RENEWAL_TYPE_LABEL[proposal.renewalType]} />
            <Spec label="환급" value={REFUND_TYPE_LABEL[proposal.refundType]} />
            <Spec label="PDF" value={proposal.pdfFileName} />
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
