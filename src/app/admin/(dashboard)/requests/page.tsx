import Link from "next/link";

import { listAssignmentDetailsForRequest } from "@/features/plan-proposals/queries";
import { listAllRequests } from "@/features/plan-requests/queries";
import { RequestStatusBadge } from "@/features/plan-requests/ui/status-badge";

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="요청 모니터링"
        description={`전체 ${requests.length}건`}
      />

      {requests.length === 0 ? (
        <Empty className="py-16">요청이 아직 없어요</Empty>
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
