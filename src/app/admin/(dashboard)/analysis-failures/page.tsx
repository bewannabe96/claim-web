import Link from "next/link";

import { listFailedAnalysisPlanProposals } from "@/features/plan-proposals/queries";
import type { AnalysisError } from "@/features/plan-proposals/schema";

import { formatDateTime } from "../_lib/format";
import { AnalysisErrorPill } from "../_components/analysis-error-pill";
import {
  Card,
  CardHeader,
  Empty,
  PageHeader,
} from "../_components/page-shell";
import { RetryAnalysisButton } from "../_components/retry-analysis-button";

/**
 * /admin/analysis-failures
 *
 * 외부 분석 파이프라인이 `status=failed` 콜백을 보내고, 그 후 성공 콜백이 들어오지
 * 않은 proposal 목록.
 */
export default async function AdminAnalysisFailuresPage() {
  const rows = await listFailedAnalysisPlanProposals();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="분석 실패"
        description={
          rows.length === 0
            ? "현재 미해결 분석 실패 없음"
            : `${rows.length}건의 미해결 분석 실패 — 외부 시스템 수정 후 재시도`
        }
      />

      {rows.length === 0 ? (
        <Card>
          <Empty>모든 제안서 분석이 정상 완료되었어요</Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <FailureCard
              key={row.proposal.id}
              proposalId={row.proposal.id}
              partnerName={row.partner.name}
              planRequestId={row.planRequestId}
              error={row.proposal.analysisError}
              errorAt={row.proposal.analysisErrorAt}
              pdfS3Key={row.proposal.pdfS3Key}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FailureCard({
  proposalId,
  partnerName,
  planRequestId,
  error,
  errorAt,
  pdfS3Key,
}: {
  proposalId: string;
  partnerName: string;
  planRequestId: string;
  error: AnalysisError | undefined;
  errorAt: string | undefined;
  pdfS3Key: string;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2 flex-wrap">
            {error && <AnalysisErrorPill group={error.group} />}
            <Link
              href={`/admin/requests/${planRequestId}`}
              className="text-sm font-bold text-black hover:underline tabular-nums"
            >
              {planRequestId}
            </Link>
            <span className="text-xs text-[#afafaf]">· {partnerName}</span>
          </span>
        }
        meta={errorAt ? <span className="tabular-nums">{formatDateTime(errorAt)}</span> : null}
      />

      {error ? (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-xs text-[#afafaf]">type</dt>
            <dd className="font-mono text-xs text-black">{error.type}</dd>
            <dt className="text-xs text-[#afafaf]">message</dt>
            <dd className="text-black">{error.message}</dd>
            <dt className="text-xs text-[#afafaf]">PDF</dt>
            <dd className="font-mono text-xs text-[#4b4b4b] break-all">
              {pdfS3Key}
            </dd>
          </dl>

          {error.detail && (
            <details className="rounded-lg border border-[#efefef] bg-[#fafafa] px-3 py-2">
              <summary className="cursor-pointer text-xs text-[#4b4b4b] hover:text-black">
                detail
              </summary>
              <pre className="mt-2 text-[11px] text-black whitespace-pre-wrap break-all">
                {JSON.stringify(error.detail, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ) : (
        <p className="text-sm text-red-600">
          저장된 에러 페이로드가 손상되었어요 (parse 실패). 서버 로그를 확인해주세요.
        </p>
      )}

      <div className="mt-5 pt-4 border-t border-[#efefef] flex justify-end">
        <RetryAnalysisButton proposalId={proposalId} />
      </div>
    </Card>
  );
}
