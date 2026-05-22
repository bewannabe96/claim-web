import Link from "next/link";
import { notFound } from "next/navigation";

import { updatePartnerSignupInvitation } from "@/features/partners/actions";
import { getPartnerSignupInvitationById } from "@/features/partners/queries";
import { nowMs } from "@/lib/wall-clock";
import { getPublicBaseUrl } from "@/server/origin";

import { PartnerForm } from "../../../_components/partner-form";
import {
  BackLink,
  Card,
  CardHeader,
  Field,
  PageHeader,
  Section,
} from "../../../_components/page-shell";
import { formatDateTime } from "../../../_lib/format";
import { CopyLink } from "./_components/copy-link";
import { InvitationActions } from "./_components/invitation-actions";

export default async function AdminPartnerSignupInvitationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invitation = await getPartnerSignupInvitationById(id);
  if (!invitation) notFound();

  // 가입 절대 URL 구성 — Kakao OAuth redirectTo 와 동일한 canonical base URL.
  const signupUrl = `${await getPublicBaseUrl()}/partner/signup/${invitation.token}`;

  const now = nowMs();
  const expired = invitation.expiresAt.getTime() < now;
  const consumed = !!invitation.consumedAt;

  const action = updatePartnerSignupInvitation.bind(null, invitation.id);

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
          <p className="py-2 text-sm text-[#4b4b4b]">
            이 초청은 가입 완료되어 더 이상 사용할 수 없어요.
            {invitation.consumedUserId && (
              <>
                {" "}
                설계사 정보는{" "}
                <Link
                  href={`/admin/partners/${invitation.consumedUserId}`}
                  className="font-medium text-black hover:underline"
                >
                  상세 페이지
                </Link>
                에서 확인하세요.
              </>
            )}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <CopyLink url={signupUrl} />
            <p className="text-xs text-[#4b4b4b] leading-relaxed">
              {invitation.existingUserId
                ? "어드민 본인 겸직 초청입니다. 같은 브라우저에서 본인이 직접 이 링크를 클릭하면 본인인증만으로 등록이 완료돼요."
                : "이 링크를 카카오톡으로 설계사에게 전달해주세요. 설계사가 진입 후 카카오 로그인 + 본인인증을 완료하면 정식 가입됩니다."}
            </p>
            <dl className="grid grid-cols-2 gap-4 pt-3 border-t border-[#efefef]">
              <Field label="발급일">{formatDateTime(invitation.createdAt)}</Field>
              <Field label="만료일">{formatDateTime(invitation.expiresAt)}</Field>
            </dl>
          </div>
        )}
      </Card>

      {!consumed && (
        <Section title="초청 정보 수정">
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
            lockedExistingUserId={invitation.existingUserId}
          />
        </Section>
      )}
    </div>
  );
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
