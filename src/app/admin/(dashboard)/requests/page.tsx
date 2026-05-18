import Link from "next/link";

import { listAssignmentDetailsForRequest } from "@/features/proposals/queries";
import { listAllRequests } from "@/features/requests/queries";
import { RequestStatusBadge } from "@/features/requests/ui/status-badge";

import {
  DataTable,
  PageHeader,
  Td,
} from "../_components/page-shell";

const COLUMNS = [
  { key: "id", label: "요청 ID" },
  { key: "customer", label: "요청자" },
  { key: "status", label: "상태" },
  { key: "submission", label: "제출 진행", align: "center" as const },
  { key: "createdAt", label: "생성", align: "right" as const },
  { key: "rematch", label: "재매칭", align: "center" as const },
];

export default async function AdminRequestsPage() {
  const requests = await listAllRequests();

  const summaries = await Promise.all(
    requests.map(async (r) => {
      const details = await listAssignmentDetailsForRequest(r.id);
      const submitted = details.filter(
        (d) => d.assignment.status === "submitted",
      ).length;
      return { request: r, submitted, total: details.length };
    }),
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="요청 모니터링"
        description={`전체 ${requests.length}건. 0명 제출되어 자동 재매칭된 케이스는 별도 표시.`}
      />

      <DataTable columns={COLUMNS}>
        {summaries.map(({ request, submitted, total }) => (
          <tr
            key={request.id}
            className="hover:bg-[#fafafa] transition-colors"
          >
            <Td>
              <Link
                href={`/admin/requests/${request.id}`}
                className="text-sm font-medium text-black hover:underline"
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
                <span className="text-xs text-[#4b4b4b]">
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
                <span className="text-sm">
                  <span className="font-semibold text-black">{submitted}</span>
                  <span className="text-[#4b4b4b]">/{total}</span>
                </span>
              ) : (
                <span className="text-xs text-[#afafaf]">—</span>
              )}
            </Td>
            <Td align="right">
              <span className="text-xs text-[#4b4b4b] whitespace-nowrap">
                {formatDateTime(request.createdAt)}
              </span>
            </Td>
            <Td align="center">
              {request.rematchCount > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-black text-white">
                  {request.rematchCount}회
                </span>
              ) : (
                <span className="text-xs text-[#afafaf]">—</span>
              )}
            </Td>
          </tr>
        ))}
      </DataTable>

      {requests.length === 0 && (
        <p className="text-center text-sm text-[#afafaf] py-12">
          요청이 아직 없어요
        </p>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}.${dd} ${hh}:${mi}`;
}
