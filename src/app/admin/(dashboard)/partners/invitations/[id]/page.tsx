import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updatePartnerInvitation } from "@/features/partners/actions";
import { getPartnerInvitationById } from "@/features/partners/queries";
import { nowMs } from "@/lib/wall-clock";

import { PartnerForm } from "../../../_components/partner-form";
import {
  BackLink,
  Card,
  CardHeader,
  PageHeader,
} from "../../../_components/page-shell";
import { CopyLink } from "./_components/copy-link";
import { InvitationActions } from "./_components/invitation-actions";

export default async function AdminPartnerInvitationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invitation = await getPartnerInvitationById(id);
  if (!invitation) notFound();

  // 가입 절대 URL 구성 — 요청 헤더의 host/proto 기준.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const signupUrl = `${proto}://${host}/partner/signup/${invitation.token}`;

  const now = nowMs();
  const expired = invitation.expiresAt.getTime() < now;
  const consumed = !!invitation.consumedAt;

  const action = updatePartnerInvitation.bind(null, invitation.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackLink href="/admin/partners">설계사 풀</BackLink>
        <PageHeader
          title={`${invitation.name} — 가입 초청`}
          description={`${invitation.phone} · ${invitation.licenseNumber}`}
          action={
            !consumed && <InvitationActions invitationId={invitation.id} />
          }
        />
      </div>

      <Card>
        <CardHeader
          title="가입 링크"
          meta={
            consumed ? (
              <span className="text-[#4b4b4b]">가입 완료 — 링크 비활성</span>
            ) : expired ? (
              <span className="text-red-600">만료됨 — 재발급 필요</span>
            ) : (
              <span className="text-[#4b4b4b]">
                만료 {formatRemaining(invitation.expiresAt, now)}
              </span>
            )
          }
        />
        {consumed ? (
          <p className="py-4 text-sm text-[#4b4b4b]">
            이 초청은 가입 완료되어 더 이상 사용할 수 없어요.
            설계사 정보는{" "}
            {invitation.consumedUserId && (
              <Link
                href={`/admin/partners/${invitation.consumedUserId}`}
                className="font-medium text-black hover:underline"
              >
                상세 페이지
              </Link>
            )}
            에서 확인하세요.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <CopyLink url={signupUrl} />
            <p className="text-xs text-[#4b4b4b]">
              이 링크를 카카오톡으로 설계사에게 전달해주세요. 설계사가 링크
              진입 후 카카오 로그인을 완료하면 정식 가입됩니다.
            </p>
            <dl className="grid grid-cols-2 gap-4 mt-2 pt-4 border-t border-[#efefef]">
              <Meta label="발급일" value={formatDateTime(invitation.createdAt)} />
              <Meta label="만료일" value={formatDateTime(invitation.expiresAt)} />
            </dl>
          </div>
        )}
      </Card>

      {!consumed && (
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-bold text-black">초청 정보 수정</h2>
          <PartnerForm
            action={action}
            submitLabel="변경 저장"
            initial={{
              name: invitation.name,
              phone: invitation.phone,
              bio: invitation.bio,
              yearsOfExperience: invitation.yearsOfExperience,
              trustMetric: invitation.trustMetric,
              licenseNumber: invitation.licenseNumber,
              active: invitation.active,
            }}
          />
        </section>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-[#4b4b4b]">{label}</dt>
      <dd className="text-sm text-black">{value}</dd>
    </div>
  );
}

function formatDateTime(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}

function formatRemaining(expiresAt: Date, nowMs: number): string {
  const remaining = expiresAt.getTime() - nowMs;
  if (remaining <= 0) return "만료";
  const days = Math.floor(remaining / (24 * 3600 * 1000));
  if (days >= 1) return `${days}일 남음`;
  const hours = Math.floor(remaining / (3600 * 1000));
  if (hours >= 1) return `${hours}시간 남음`;
  const mins = Math.max(1, Math.floor(remaining / (60 * 1000)));
  return `${mins}분 남음`;
}
