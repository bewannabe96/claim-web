import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 어드민 로그인 — PC 환경. 가운데 정렬 카드.
 * MVP: 폼 노출만. 인증 로직은 후속 (server/dal.ts requireSession 연결).
 */
export default function AdminLoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-md rounded-xl border border-[#efefef] bg-white p-8 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
        <div className="flex items-baseline gap-2">
          <BrandMark />
          <span className="text-sm text-[#4b4b4b]">운영자</span>
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-black">
          로그인
        </h1>
        <p className="mt-2 text-sm text-[#4b4b4b]">
          운영자 계정으로 로그인하세요.
        </p>

        <form className="mt-8 flex flex-col gap-4">
          <Field label="이메일">
            <Input
              type="email"
              name="email"
              placeholder="admin@dopda.kr"
              className="h-12 px-4 text-base"
              autoComplete="email"
            />
          </Field>
          <Field label="비밀번호">
            <Input
              type="password"
              name="password"
              placeholder="••••••••"
              className="h-12 px-4 text-base"
              autoComplete="current-password"
            />
          </Field>

          <Link
            href="/admin"
            className={cn(
              buttonVariants(),
              "mt-2 w-full h-12 rounded-full text-sm font-medium",
            )}
          >
            로그인 (데모)
          </Link>
        </form>

        <p className="mt-6 text-xs text-[#afafaf] text-center">
          MVP — 인증 로직 후속. 데모 버튼이 바로 대시보드로 이동합니다.
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-black">{label}</label>
      {children}
    </div>
  );
}
