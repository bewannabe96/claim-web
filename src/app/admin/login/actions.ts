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
 * 인증 + 권한 2단계. 권한 없는 사용자에게는 동일한 에러 메시지로 응답해
 * admin 계정 enumeration 을 방어.
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

  const admin = await prisma.adminUser.findUnique({
    where: { id: data.user.id },
    select: { active: true },
  });
  if (!admin || !admin.active) {
    await supabase.auth.signOut();
    return { error: "로그인에 실패했습니다." };
  }

  redirect("/admin");
}
