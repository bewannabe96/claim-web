"use server";

import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/server/supabase";

/**
 * Partner 로그아웃. Supabase 세션 cookie 제거 후 로그인 페이지로 redirect.
 *
 * 가드 불필요 — 로그인 안 된 사용자가 호출해도 무해 (signOut no-op + redirect).
 * admin signOutAdmin 과 동일 패턴.
 */
export async function signOutPartner() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/partner/login");
}
