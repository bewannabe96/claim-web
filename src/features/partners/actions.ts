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
 * `existingUserId` 는 어드민 본인 겸직 흐름 — 같은 User 에 Partner extension 만
 * 추가하는 시나리오. phone 으로 매칭된 user 가 active admin 이면서 partner 가
 * 없고, id 가 인자와 일치할 때만 phone 충돌 검사를 통과시킴.
 *
 * 동시성: 두 어드민이 같은 phone 으로 동시에 invitation 발급 시 둘 다 통과할 수
 * 있음 — 어드민 only 흐름이라 의도된 trade-off (DB partial unique 미사용 정책).
 */
async function checkInvitationConflicts(
  input: PartnerInput,
  options: { excludeInvitationId?: string; existingUserId?: string | null } = {},
): Promise<string | null> {
  const { excludeInvitationId, existingUserId } = options;
  const [userByPhone, partnerByLicense, pendingByPhone, pendingByLicense] =
    await Promise.all([
      prisma.user.findUnique({
        where: { phone: input.phone },
        select: {
          id: true,
          partner: { select: { id: true } },
          admin: { select: { active: true } },
        },
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

  if (userByPhone) {
    if (userByPhone.partner) {
      return "이미 가입된 설계사입니다.";
    }
    const isActiveAdmin = userByPhone.admin?.active === true;
    if (isActiveAdmin && existingUserId === userByPhone.id) {
      // 겸직 모드 — phone 충돌 통과. 자격번호 / pending 검사는 계속 진행.
    } else if (isActiveAdmin) {
      return "이미 가입된 어드민 휴대폰 번호입니다. 어드민 본인 설계사 등록을 선택해주세요.";
    } else {
      return "이미 가입된 휴대폰 번호입니다.";
    }
  } else if (existingUserId) {
    // existingUserId 가 set 됐는데 phone 매칭 user 없음 = inconsistent.
    return "어드민 본인 설계사 등록 정보가 일치하지 않습니다.";
  }

  if (partnerByLicense) return "이미 등록된 자격번호입니다.";
  if (pendingByPhone) return "같은 휴대폰 번호로 발급된 미사용 초청이 있습니다.";
  if (pendingByLicense) return "같은 자격번호로 발급된 미사용 초청이 있습니다.";
  return null;
}

/**
 * UI inline confirm 용 — phone 으로 active admin user 를 찾아 겸직 모드 후보인지
 * 판정. admin 화이트리스트 진입자만 호출 가능 (enumeration 방어).
 *
 * `match: true` 조건: phone 매칭 user 존재 + admin extension active + partner 없음
 * + 호출자 본인의 admin user.id 와 일치 (다른 어드민의 phone 으로 본인 등록 시도 차단).
 */
export async function lookupAdminUserByPhone(
  phone: string,
): Promise<
  | { match: false }
  | { match: true; userId: string; name: string }
> {
  const session = await requireAdminSession();

  // 형식 검증 — 다른 input 과 동일 정규식.
  if (!/^01[0-9]{8,9}$/.test(phone)) {
    return { match: false };
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      name: true,
      partner: { select: { id: true } },
      admin: { select: { active: true } },
    },
  });
  if (!user) return { match: false };
  if (user.partner) return { match: false };
  if (!user.admin?.active) return { match: false };
  if (user.id !== session.user.id) return { match: false };
  return { match: true, userId: user.id, name: user.name };
}

/**
 * 겸직 흐름 — `existingUserId` 가 set 됐을 때 호출자 admin 본인 + user.phone 일치
 * 까지 재검증. invitation create / 가입 트랜잭션 진입 전에 한 번 더 강제.
 */
async function validateExistingUserAdminLink(
  existingUserId: string,
  phone: string,
): Promise<string | null> {
  const session = await requireAdminSession();
  if (session.user.id !== existingUserId) {
    return "어드민 본인 설계사 등록은 본인 계정으로만 가능합니다.";
  }
  const user = await prisma.user.findUnique({
    where: { id: existingUserId },
    select: {
      phone: true,
      partner: { select: { id: true } },
      admin: { select: { active: true } },
    },
  });
  if (!user || !user.admin?.active) {
    return "어드민 본인 정보를 확인할 수 없습니다.";
  }
  if (user.partner) {
    return "이미 설계사로 등록된 어드민입니다.";
  }
  if (user.phone !== phone) {
    return "어드민 등록 휴대폰 번호와 일치하지 않습니다.";
  }
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

  const rawExistingUserId = formData.get("existingUserId");
  const existingUserId =
    typeof rawExistingUserId === "string" && rawExistingUserId.length > 0
      ? rawExistingUserId
      : null;

  if (existingUserId) {
    const linkError = await validateExistingUserAdminLink(
      existingUserId,
      parsed.data.phone,
    );
    if (linkError) {
      return { ok: false, errors: { _form: [linkError] } };
    }
  }

  const conflict = await checkInvitationConflicts(parsed.data, {
    existingUserId,
  });
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
        existingUserId,
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
    select: { consumedAt: true, existingUserId: true, phone: true },
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

  // 겸직 invitation 의 phone 변경 금지 — admin user.phone 과 일치 강제.
  if (existing.existingUserId && existing.phone !== parsed.data.phone) {
    return {
      ok: false,
      errors: {
        _form: [
          "어드민 본인 겸직 초청의 휴대폰 번호는 변경할 수 없습니다.",
        ],
      },
    };
  }

  const conflict = await checkInvitationConflicts(parsed.data, {
    excludeInvitationId: invitationId,
    existingUserId: existing.existingUserId,
  });
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
 * 주 용도: token 회전 + expiresAt 갱신 (구 token 즉시 무효). consumedAt IS NULL
 * 조건으로 race-safe — 이미 가입 완료된 invitation 은 못 건드림.
 *
 * 부수적으로 `linkedAuthId` / `phoneVerifiedAt` 도 NULL 로 리셋 — 새 흐름에선 어차피
 * 다음 진입의 OAuth 가 덮어쓰므로 잠금 해제 목적은 아님 (cleanliness). 본인인증
 * audit 의 의미를 새 token 발급 시점에 초기화하는 의도.
 */
export async function reissuePartnerInvitationToken(
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminSession();

  const result = await prisma.partnerInvitation.updateMany({
    where: { id: invitationId, consumedAt: null },
    data: {
      token: newToken(),
      expiresAt: nextExpiresAt(),
      linkedAuthId: null,
      phoneVerifiedAt: null,
    },
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
 * phone 변경 시 User.phone UNIQUE 제약을 P2002 로 분기.
 * 매칭 카운터 (matchStats) 는 partner_match_stats 가 1:1 로 별도 관리.
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
