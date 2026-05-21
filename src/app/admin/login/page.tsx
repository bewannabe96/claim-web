import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { getOptionalAdminSession } from "@/server/dal";

import { LoginForm } from "./_components/login-form";

/**
 * 어드민 로그인 — PC 환경. 가운데 정렬 카드.
 * 이미 로그인된 admin 은 /admin 으로 자동 이동.
 */
export default async function AdminLoginPage() {
  const session = await getOptionalAdminSession();
  if (session) redirect("/admin");

  return (
    <main className="flex-1 flex items-center justify-center p-8 bg-[#fafafa]">
      <div className="w-full max-w-md rounded-xl border border-[#efefef] bg-white p-8 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
        <div className="flex items-baseline gap-2">
          <BrandMark />
          <span className="text-xs text-[#afafaf] uppercase tracking-wider">
            Admin
          </span>
        </div>

        <h1 className="mt-8 text-2xl font-bold tracking-tight text-black">
          로그인
        </h1>
        <p className="mt-1.5 text-sm text-[#4b4b4b]">
          운영자 계정으로 로그인하세요.
        </p>

        <LoginForm />
      </div>
    </main>
  );
}
