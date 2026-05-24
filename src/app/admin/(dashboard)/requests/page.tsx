import Link from "next/link";

import { listAssignmentDetailsForRequest } from "@/features/plan-proposals/queries";
import {
  countPreSubmissionRequests,
  listAllRequests,
} from "@/features/plan-requests/queries";
import { RequestStatusBadge } from "@/features/plan-requests/ui/status-badge";
import { cn } from "@/lib/utils";

import { formatDateTime } from "../_lib/format";
import {
  Badge,
  DataTable,
  Empty,
  PageHeader,
  Td,
} from "../_components/page-shell";

const COLUMNS = [
  { key: "id", label: "요청 ID" },
  { key: "customer", label: "요청자" },
  { key: "status", label: "상태" },
  { key: "submission", label: "제출", align: "center" as const },
  { key: "createdAt", label: "생성", align: "right" as const },
  { key: "rematch", label: "재매칭", align: "center" as const },
];

/**
 * 보기 토글 — 기본은 제출까지 간 요청만, "전체" 선택 시 작성·인증 중 임시 요청까지 노출.
 * Server Component 안의 순수 링크 — soft nav 로 searchParams 만 토글.
 */
function ViewToggle({ showAll }: { showAll: boolean }) {
  const itemClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
      active ? "bg-black text-white" : "text-[#4b4b4b] hover:text-black",
    );

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-[#efefef] bg-[#fafafa] p-0.5">
      <Link href="/admin/requests" className={itemClass(!showAll)}>
        제출된 요청
      </Link>
      <Link
        href={{ pathname: "/admin/requests", query: { view: "all" } }}
        className={itemClass(showAll)}
      >
        전체
      </Link>
    </div>
  );
}

/**
 * 헤더 우측 CTA — 보기 토글 + 가입자 대신 요청서 작성 진입.
 * proxy 요청서 작성은 어드민이 가입자에게 정보를 받아 직접 입력하는 흐름. 본인인증
 * 생략 + 즉시 dispatched 까지 한 폼에서 완료 ([requests/new/page.tsx]).
 */
function HeaderActions({ showAll }: { showAll: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <ViewToggle showAll={showAll} />
      <Link
        href="/admin/requests/new"
        className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-medium bg-black text-white hover:bg-[#1a1a1a] transition-colors whitespace-nowrap"
      >
        + 새 요청서 작성
      </Link>
    </div>
  );
}

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showAll = view === "all";

  const [requests, hiddenCount] = await Promise.all([
    listAllRequests({ includePreSubmission: showAll }),
    // "전체" 뷰에서는 숨김 안내가 없어 count 불필요 — 쿼리 생략.
    showAll ? Promise.resolve(0) : countPreSubmissionRequests(),
  ]);

  const summaries = await Promise.all(
    requests.map(async (r) => {
      const details = await listAssignmentDetailsForRequest(r.id);
      const submitted = details.filter(
        (d) => d.assignment.status === "submitted",
      ).length;
      return { request: r, submitted, total: details.length };
    }),
  );

  const description = showAll
    ? `전체 ${requests.length}건`
    : hiddenCount > 0
      ? `제출된 요청 ${requests.length}건 · 작성·인증 중 ${hiddenCount}건 숨김`
      : `제출된 요청 ${requests.length}건`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="요청 모니터링"
        description={description}
        action={<HeaderActions showAll={showAll} />}
      />

      {requests.length === 0 ? (
        <Empty className="py-16">
          {!showAll && hiddenCount > 0
            ? `제출까지 간 요청이 아직 없어요 · 작성·인증 중 ${hiddenCount}건`
            : "요청이 아직 없어요"}
        </Empty>
      ) : (
        <DataTable columns={COLUMNS}>
          {summaries.map(({ request, submitted, total }) => (
            <tr
              key={request.id}
              className="hover:bg-[#fafafa] transition-colors"
            >
              <Td>
                <Link
                  href={`/admin/requests/${request.id}`}
                  className="text-sm font-medium text-black hover:underline tabular-nums"
                >
                  {request.id}
                </Link>
              </Td>
              <Td>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-black">
                    {request.step3?.name ?? (
                      <span className="text-[#afafaf]">미입력</span>
                    )}
                  </span>
                  <span className="text-xs text-[#afafaf]">
                    {request.gender
                      ? request.gender === "male"
                        ? "남"
                        : "여"
                      : "—"}{" "}
                    · {request.step1.occupation}
                  </span>
                </div>
              </Td>
              <Td>
                <RequestStatusBadge status={request.status} />
              </Td>
              <Td align="center">
                {total > 0 ? (
                  <span className="text-sm tabular-nums">
                    <span className="font-semibold text-black">
                      {submitted}
                    </span>
                    <span className="text-[#afafaf]">/{total}</span>
                  </span>
                ) : (
                  <span className="text-xs text-[#afafaf]">—</span>
                )}
              </Td>
              <Td align="right">
                <span className="text-xs text-[#4b4b4b] whitespace-nowrap tabular-nums">
                  {formatDateTime(request.createdAt)}
                </span>
              </Td>
              <Td align="center">
                {request.rematchCount > 0 ? (
                  <Badge tone="solid">{request.rematchCount}회</Badge>
                ) : (
                  <span className="text-xs text-[#afafaf]">—</span>
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
