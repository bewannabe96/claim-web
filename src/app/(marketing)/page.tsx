import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <BrandMark />

      <h1 className="mt-6 text-[2rem] font-bold leading-[1.22] tracking-tight text-black">
        나에게 딱 맞는
        <br />
        보험 설계사를
        <br />
        찾아드립니다
      </h1>

      <p className="mt-4 text-sm text-[#4b4b4b] leading-relaxed">
        30초 안에 나와 맞는 설계사를 추천해드려요.
        <br />
        진설계는 한 자리에서 비교하세요.
      </p>

      <div className="mt-10 flex flex-col gap-3 text-sm text-[#4b4b4b]">
        <Bullet>관심 보장만 입력하면 끝</Bullet>
        <Bullet>여러 설계사의 진설계를 비교</Bullet>
        <Bullet>광고비를 받지 않는 중립 추천</Bullet>
      </div>

      <div className="mt-auto pt-10">
        <Link
          href="/request/new"
          className={`${buttonVariants({ size: "lg" })} w-full h-14 rounded-full text-base font-medium`}
        >
          시작하기
        </Link>
      </div>
    </main>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-black shrink-0" />
      <span>{children}</span>
    </div>
  );
}
