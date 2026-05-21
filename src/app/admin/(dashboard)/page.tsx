import { cookies } from "next/headers";
import Link from "next/link";

import { listAllPartners } from "@/features/partners/queries";
import { listAssignmentDetailsForRequest } from "@/features/plan-proposals/queries";
import { listAllRequests } from "@/features/plan-requests/queries";
import {
  ACTIVE_STATUSES,
  type PlanRequest,
} from "@/features/plan-requests/schema";
import { RequestStatusBadge } from "@/features/plan-requests/ui/status-badge";
import { nowMs } from "@/lib/wall-clock";
import { getSettings } from "@/server/settings";
import { GENDER_LABEL } from "@/types";

import { formatDateTime } from "./_lib/format";
import {
  Card,
  CardHeader,
  Empty,
  Kpi,
  PageHeader,
  Stat,
} from "./_components/page-shell";

export default async function AdminDashboardPage() {
  // dynamic 인디케이터 — Date.now() 가 prerender 단계에서 실행되지 않도록.
  await cookies();

  const [requests, partners, settings] = await Promise.all([
    listAllRequests(),
    listAllPartners(),
    getSettings(),
  ]);

  // KPI
  const inFlight = requests.filter((r) =>
    ACTIVE_STATUSES.includes(r.status),
  ).length;
  const completed = requests.filter((r) => r.status === "completed").length;
  const rematching = requests.filter((r) => r.status === "rematching").length;
  const activePartners = partners.filter((a) => a.active).length;

  // 최근 요청 5건
  const recent = requests.slice(0, 5);

  // 마감 임박 (24h 이내)
  const now = nowMs();
  const dueSoon = requests
    .filter(
      (r) =>
        r.status === "dispatched" &&
        r.deadlineAt &&
        Date.parse(r.deadlineAt) - now < 24 * 3600 * 1000,
    )
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="대시보드"
        description="시스템 전반의 매칭 현황을 한눈에 보세요."
      />

      <section className="grid grid-cols-4 gap-4">
        <Kpi
          label="진행 중 요청"
          value={inFlight}
          hint="active 상태 합계"
        />
        <Kpi
          label="완료 요청"
          value={completed}
          hint="결과 발송 완료"
        />
        <Kpi
          label="재매칭 대기"
          value={rematching}
          tone={rematching > 0 ? "alert" : "default"}
          hint={rematching > 0 ? "수동 개입 필요" : "0건"}
        />
        <Kpi
          label="활성 설계사"
          value={activePartners}
          hint={`풀 전체 ${partners.length}명`}
        />
      </section>

      <section className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="최근 요청"
            meta={
              <Link
                href="/admin/requests"
                className="text-xs font-medium text-black hover:underline"
              >
                전체 보기 →
              </Link>
            }
          />
          {recent.length === 0 ? (
            <Empty>요청이 아직 없어요</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-[#efefef] -mx-1">
              {recent.map((r) => (
                <RequestRowItem key={r.id} request={r} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="마감 임박" meta="24시간 이내" />
          {dueSoon.length === 0 ? (
            <Empty>임박 요청 없음</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-[#efefef] -mx-1">
              {dueSoon.map((r) => (
                <DueSoonRow key={r.id} request={r} nowMs={now} />
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Card>
        <CardHeader
          title="시스템 설정"
          meta={
            <Link
              href="/admin/settings"
              className="text-xs font-medium text-black hover:underline"
            >
              편집 →
            </Link>
          }
        />
        <dl className="grid grid-cols-4 gap-6">
          <Stat label="후보 수 (N)" value={settings.candidateCount} />
          <Stat label="선택 한도 (K)" value={settings.selectLimit} />
          <Stat
            label="제출 마감"
            value={`${settings.submissionDeadlineHours}시간`}
          />
          <Stat
            label="페널티 윈도우"
            value={`${settings.penaltyWindow}건`}
          />
        </dl>
      </Card>
    </div>
  );
}

async function RequestRowItem({ request }: { request: PlanRequest }) {
  const details = await listAssignmentDetailsForRequest(request.id);
  const submitted = details.filter(
    (d) => d.assignment.status === "submitted",
  ).length;
  const total = details.length;

  return (
    <li className="px-1 py-3 flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/requests/${request.id}`}
            className="text-sm font-medium text-black hover:underline truncate"
          >
            {request.step3?.name ?? (
              <span className="text-[#afafaf]">미입력</span>
            )}
          </Link>
          <RequestStatusBadge status={request.status} />
        </div>
        <p className="text-xs text-[#afafaf]">
          {request.gender ? GENDER_LABEL[request.gender] : "—"} ·{" "}
          {request.step1.occupation} · {formatDateTime(request.createdAt)}
        </p>
      </div>
      {total > 0 && (
        <span className="shrink-0 text-xs text-[#4b4b4b] tabular-nums">
          <span className="font-semibold text-black">{submitted}</span>/{total}
        </span>
      )}
    </li>
  );
}

function DueSoonRow({
  request,
  nowMs,
}: {
  request: PlanRequest;
  nowMs: number;
}) {
  const remaining = request.deadlineAt
    ? Date.parse(request.deadlineAt) - nowMs
    : 0;
  const hours = Math.max(0, Math.floor(remaining / (3600 * 1000)));

  return (
    <li className="px-1 py-3 flex items-center justify-between gap-3">
      <Link
        href={`/admin/requests/${request.id}`}
        className="text-sm text-black hover:underline truncate"
      >
        {request.step3?.name ?? request.id}
      </Link>
      <span className="text-xs font-semibold text-black whitespace-nowrap tabular-nums">
        {hours}시간 남음
      </span>
    </li>
  );
}
