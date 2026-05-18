"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { newId } from "@/lib/id";
import { requireAdminSession } from "@/server/dal";
import { prisma } from "@/server/db/prisma";

import { PartnerInputSchema, type PartnerInput } from "./schema";

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
    email: formData.get("email"),
    phone: formData.get("phone"),
    avatarUrl: formData.get("avatarUrl"),
    bio: formData.get("bio"),
    yearsOfExperience: Number(formData.get("yearsOfExperience")),
    trustMetric: formData.get("trustMetric"),
    licenseNumber: formData.get("licenseNumber") ?? "",
    active: formData.get("active") === "on",
  });
}

/**
 * 신규 설계사 등록 — 어드민 전용.
 *
 * 검증은 운영자가 오프라인에서 수행 후 등록 (PRD §5.8).
 * User + Partner 한 트랜잭션으로 INSERT (PK 공유). authId 는 null 로 둠 — 첫
 * 카카오톡 로그인 시 callback 이 email 로 lookup 후 claim.
 *
 * Server action 은 layout 의 인증 게이트를 거치지 않으므로 자체 가드 필수.
 */
export async function createPartner(
  _prev: PartnerMutationState,
  formData: FormData,
): Promise<PartnerMutationState> {
  await requireAdminSession();

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const userId = newId();

  try {
    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: userId,
          email: parsed.data.email,
          name: parsed.data.name,
          phone: parsed.data.phone,
          role: "partner",
        },
      }),
      prisma.partner.create({
        data: {
          id: userId,
          avatarUrl: parsed.data.avatarUrl,
          bio: parsed.data.bio,
          yearsOfExperience: parsed.data.yearsOfExperience,
          trustMetric: parsed.data.trustMetric,
          licenseNumber: parsed.data.licenseNumber,
          active: parsed.data.active,
        },
      }),
    ]);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // unique violation — email / phone / licenseNumber
      return {
        ok: false,
        errors: {
          _form: ["같은 이메일/휴대폰/자격번호로 이미 등록된 사용자가 있어요."],
        },
      };
    }
    throw err;
  }

  revalidatePath("/admin/partners");
  redirect("/admin/partners");
}

/**
 * 기존 설계사 수정 — 어드민 전용. 폼 입력 필드만 갱신 가능.
 * exposureCount/recentSubmissions 는 시스템 카운터라 폼 밖.
 * email 변경 시 User row, 나머지 partner 필드는 Partner row.
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
          email: parsed.data.email,
          name: parsed.data.name,
          phone: parsed.data.phone,
        },
      }),
      prisma.partner.update({
        where: { id: partnerId },
        data: {
          avatarUrl: parsed.data.avatarUrl,
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
            _form: ["같은 이메일/휴대폰/자격번호가 이미 다른 사용자에 사용 중입니다."],
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
