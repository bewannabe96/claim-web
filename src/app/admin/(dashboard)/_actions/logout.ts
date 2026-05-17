"use server";

import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/server/supabase";

export async function signOutAdmin() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
