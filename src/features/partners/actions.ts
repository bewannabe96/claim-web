"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { newId, newToken } from "@/lib/id";
import { requireAdminSession } from "@/server/dal";
import { prisma } from "@/server/db/prisma";

import {
  PARTNER_INVITATION_TTL_DAYS,
  PartnerInputSchema,
  type PartnerInput,
} from "./schema";

export type PartnerMutationState =
  | { ok: true; id?: string }
  | {
      ok?: false;
      errors?: Partial<Record<keyof PartnerInput | "_form", string[]>>;
    }
  | undefined;

function parseForm(formData: FormData) {
  return PartnerInputSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    bio: formData.get("bio"),
    yearsOfExperience: Number(formData.get("yearsOfExperience")),
    trustMetric: formData.get("trustMetric"),
    licenseNumber: formData.get("licenseNumber") ?? "",
    active: formData.get("active") === "on",
  });
}

function nextExpiresAt(): Date {
  return new Date(
    Date.now() + PARTNER_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
}

/**
 * 사전 충돌 검사 — invitation 생성/수정 시점에 호출.
 *
 * DB 제약 (User.phone UNIQUE, Partner.licenseNumber UNIQUE) 은 가입 완료된 row 만
 * 막아주므로, 미소비 invitation 끼리의 충돌은 앱 레이어가 책임.
 *
 * `excludeInvitationId` 는 수정 모드에서 자기 자신을 제외하기 위함.
 *
 * 동시성: 두 어드민이 같은 phone 으로 동시에 invitation 발급 시 둘 다 통과할 수
 * 있음 — 어드민 only 흐름이라 의도된 trade-off (DB partial unique 미사용 정책).
 */
async function checkInvitationConflicts(
  input: PartnerInput,
  excludeInvitationId?: string,
): Promise<string | null> {
  const [userByPhone, partnerByLicense, pendingByPhone, pendingByLicense] =
    await Promise.all([
      prisma.user.findUnique({
        where: { phone: input.phone },
        select: { id: true },
      }),
      prisma.partner.findUnique({
        where: { licenseNumber: input.licenseNumber },
        select: { id: true },
      }),
      prisma.partnerInvitation.findFirst({
        where: {
          phone: input.phone,
          consumedAt: null,
          ...(excludeInvitationId && { NOT: { id: excludeInvitationId } }),
        },
        select: { id: true },
      }),
      prisma.partnerInvitation.findFirst({
        where: {
          licenseNumber: input.licenseNumber,
          consumedAt: null,
          ...(excludeInvitationId && { NOT: { id: excludeInvitationId } }),
        },
        select: { id: true },
      }),
    ]);

  if (userByPhone) return "이미 가입된 휴대폰 번호입니다.";
  if (partnerByLicense) return "이미 등록된 자격번호입니다.";
  if (pendingByPhone) return "같은 휴대폰 번호로 발급된 미사용 초청이 있습니다.";
  if (pendingByLicense) return "같은 자격번호로 발급된 미사용 초청이 있습니다.";
  return null;
}

/**
 * 신규 설계사 가입 초청 발급 — 어드민 전용.
 *
 * user/partner row 는 만들지 않음. partner_invitation 한 row + 일회용 token + 만료시각만
 * 저장. 어드민은 발급된 가입 링크 (`/partner/signup/[token]`) 를 복사해 설계사에게 전달.
 * 설계사가 Kakao OAuth 로 가입 완료해야 user + partner 트랜잭션 INSERT (콜백이 책임).
 *
 * Server action 은 layout 의 인증 게이트를 거치지 않으므로 자체 가드 필수.
 */
export async function createPartnerInvitation(
  _prev: PartnerMutationState,
  formData: FormData,
): Promise<PartnerMutationState> {
  await requireAdminSession();

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const conflict = await checkInvitationConflicts(parsed.data);
  if (conflict) {
    return { ok: false, errors: { _form: [conflict] } };
  }

  const id = newId();

  try {
    await prisma.partnerInvitation.create({
      data: {
        id,
        name: parsed.data.name,
        phone: parsed.data.phone,
        bio: parsed.data.bio,
        yearsOfExperience: parsed.data.yearsOfExperience,
        trustMetric: parsed.data.trustMetric,
        licenseNumber: parsed.data.licenseNumber,
        active: parsed.data.active,
        token: newToken(),
        expiresAt: nextExpiresAt(),
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // token 충돌 (사실상 발생 X) 또는 동시성으로 빠져나간 phone/license 중복.
      return {
        ok: false,
        errors: {
          _form: ["초청 발급 중 충돌이 발생했습니다. 다시 시도해주세요."],
        },
      };
    }
    throw err;
  }

  revalidatePath("/admin/partners");
  redirect(`/admin/partners/invitations/${id}`);
}

/**
 * 미소비 가입 초청 정보 수정 — 어드민 전용.
 * token / expiresAt 은 reissue 로만 변경 (편집과 분리).
 */
export async function updatePartnerInvitation(
  invitationId: string,
  _prev: PartnerMutationState,
  formData: FormData,
): Promise<PartnerMutationState> {
  await requireAdminSession();

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.partnerInvitation.findUnique({
    where: { id: invitationId },
    select: { consumedAt: true },
  });
  if (!existing) {
    return { ok: false, errors: { _form: ["초청을 찾을 수 없습니다."] } };
  }
  if (existing.consumedAt) {
    return {
      ok: false,
      errors: { _form: ["이미 가입 완료된 초청은 수정할 수 없습니다."] },
    };
  }

  const conflict = await checkInvitationConflicts(parsed.data, invitationId);
  if (conflict) {
    return { ok: false, errors: { _form: [conflict] } };
  }

  await prisma.partnerInvitation.update({
    where: { id: invitationId },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      bio: parsed.data.bio,
      yearsOfExperience: parsed.data.yearsOfExperience,
      trustMetric: parsed.data.trustMetric,
      licenseNumber: parsed.data.licenseNumber,
      active: parsed.data.active,
    },
  });

  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/invitations/${invitationId}`);
  return { ok: true, id: invitationId };
}

/**
 * 가입 초청 token 재발급 — 어드민 전용.
 *
 * token 회전 + expiresAt 갱신. consumedAt IS NULL 조건으로 race-safe.
 * 구 token 은 즉시 무효 (DB 에서 사라짐).
 */
export async function reissuePartnerInvitationToken(
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminSession();

  const result = await prisma.partnerInvitation.updateMany({
    where: { id: invitationId, consumedAt: null },
    data: { token: newToken(), expiresAt: nextExpiresAt() },
  });

  if (result.count === 0) {
    return {
      ok: false,
      error: "재발급 불가 — 이미 가입 완료되었거나 초청이 삭제되었습니다.",
    };
  }

  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/invitations/${invitationId}`);
  return { ok: true };
}

/**
 * 가입 초청 삭제 — 어드민 전용. 미소비 invitation 만 삭제 가능.
 * 소비된 invitation 은 audit 용으로 보존 (가입 완료된 설계사와의 trace).
 */
export async function deletePartnerInvitation(
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminSession();

  const result = await prisma.partnerInvitation.deleteMany({
    where: { id: invitationId, consumedAt: null },
  });

  if (result.count === 0) {
    return {
      ok: false,
      error: "삭제 불가 — 이미 가입 완료된 초청입니다.",
    };
  }

  revalidatePath("/admin/partners");
  return { ok: true };
}

/**
 * 기존 설계사 수정 — 어드민 전용. 이미 가입 완료된 partner 의 폼 필드를 갱신.
 *
 * email 은 폼에 없음 — auth.users.email 이 진실, 어드민이 수정하지 않음.
 * exposureCount/recentSubmissions 는 시스템 카운터라 폼 밖.
 * phone 변경 시 User.phone UNIQUE 제약을 P2002 로 분기.
 *
 * Server action 은 layout 의 인증 게이트를 거치지 않으므로 자체 가드 필수.
 */
export async function updatePartner(
  partnerId: string,
  _prev: PartnerMutationState,
  formData: FormData,
): Promise<PartnerMutationState> {
  await requireAdminSession();

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: partnerId },
        data: {
          name: parsed.data.name,
          phone: parsed.data.phone,
        },
      }),
      prisma.partner.update({
        where: { id: partnerId },
        data: {
          bio: parsed.data.bio,
          yearsOfExperience: parsed.data.yearsOfExperience,
          trustMetric: parsed.data.trustMetric,
          licenseNumber: parsed.data.licenseNumber,
          active: parsed.data.active,
        },
      }),
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return { ok: false, errors: { _form: ["설계사를 찾을 수 없습니다."] } };
      }
      if (err.code === "P2002") {
        return {
          ok: false,
          errors: {
            _form: ["같은 휴대폰/자격번호가 이미 다른 사용자에 사용 중입니다."],
          },
        };
      }
    }
    throw err;
  }

  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${partnerId}`);
  return { ok: true, id: partnerId };
}
