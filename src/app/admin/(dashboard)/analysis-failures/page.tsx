import Link from "next/link";

import { listFailedAnalysisProposals } from "@/features/plan-proposals/queries";
import type { AnalysisError } from "@/features/plan-proposals/schema";

import { AnalysisErrorPill } from "../_components/analysis-error-pill";
import { Card, CardHeader, PageHeader } from "../_components/page-shell";
import { RetryAnalysisButton } from "../_components/retry-analysis-button";

/**
 * /admin/analysis-failures
 *
 * 외부 분석 파이프라인이 `status=failed` 콜백을 보내고, 그 후 성공 콜백이 들어오지
 * 않은 proposal 목록 (`analyzedAt IS NULL AND analysisErrorAt IS NOT NULL`).
 * `group=product_id_match` 가 주 use-case (어드민이 카탈로그 매핑 추가 후 재시도)
 * 지만, `input_error` / `internal_error` 도 모니터링 목적으로 함께 노출.
 *
 * 운영 흐름:
 *   1. webhook 이 failed 페이로드 수신 → analysisError 마킹 → 이 페이지에 등장.
 *   2. 어드민이 group/type/message/detail 확인 → 외부 시스템 (카탈로그 등) 수정.
 *   3. "분석 재시도" 클릭 → SQS 재발행 → 분석 성공 시 row 사라짐.
 *
 * 분석 성공이 들어오면 자연스럽게 사라지므로 별도 dismiss 액션은 없음. 영구
 * 미해결 케이스는 plan_request 가 analyzing 으로 정체된다는 신호 — 추후 별도
 * status (analysis_failed) 도입 시 보강 예정.
 */
export default async function AdminAnalysisFailuresPage() {
  const rows = await listFailedAnalysisProposals();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="분석 실패"
        description={
          rows.length === 0
            ? "현재 미해결 분석 실패 없음."
            : `${rows.length}건의 미해결 분석 실패. 외부 시스템 수정 후 재시도해주세요.`
        }
      />

      {rows.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-[#afafaf] py-8">
            🎉 모든 제안서 분석이 정상 완료되었어요
          </p>
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
              className="text-sm font-bold text-black hover:underline"
            >
              {planRequestId}
            </Link>
            <span className="text-xs text-[#4b4b4b]">· {partnerName}</span>
          </span>
        }
        meta={errorAt ? formatDateTime(errorAt) : null}
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
        <p className="text-sm text-[#c2410c]">
          저장된 에러 페이로드가 손상되었어요 (parse 실패). 서버 로그를 확인해주세요.
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-[#efefef] flex justify-end">
        <RetryAnalysisButton proposalId={proposalId} />
      </div>
    </Card>
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
