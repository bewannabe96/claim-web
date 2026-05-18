"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { getSupabaseServerClient } from "@/server/supabase";

const SignInInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SignInState = { error?: string };

/**
 * Admin 로그인.
 *
 * 인증 + 권한 2단계 — 권한 없는 사용자에게는 동일한 에러 메시지로 응답해 admin
 * 계정 enumeration 을 방어.
 *
 * User.authId 가 비어 있는 첫 로그인이면 email 로 매칭 후 authId claim. 다음 로그인부터
 * 는 DAL 이 authId 로 바로 lookup.
 */
export async function signInAdmin(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = SignInInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "이메일과 비밀번호를 확인해주세요." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "로그인에 실패했습니다." };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, authId: true, role: true, admin: { select: { active: true } } },
  });
  if (!user || user.role !== "admin" || !user.admin?.active) {
    await supabase.auth.signOut();
    return { error: "로그인에 실패했습니다." };
  }

  // 첫 로그인 — authId claim. 이후엔 DAL 이 authId 로 직접 lookup.
  if (!user.authId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { authId: data.user.id },
    });
  } else if (user.authId !== data.user.id) {
    // 다른 auth.users.id 와 매핑되어 있으면 정책상 거부 — 운영자 수동 정정 필요.
    await supabase.auth.signOut();
    return { error: "로그인에 실패했습니다." };
  }

  redirect("/admin");
}
