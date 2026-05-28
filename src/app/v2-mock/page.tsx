import Link from "next/link";

import { ClaimStudioMark } from "./_components/claim-studio-mark";

/**
 * v2-mock 인덱스 — 워크스페이스 두 진입점 link.
 *
 * 모든 v2 surface (업로드 · 가입 modal · 온보딩 · 임시 분석 · 슬롯 제거 등) 는
 * 워크스페이스 두 화면 (채워진 / 빈) 안에서 자연스럽게 도달. 별도 직접 link 는
 * 두지 않음 — picker / entry CTA 거치는 정상 흐름이 mock 시연의 1차 의도.
 *
 * 실 라우트 (`/`, `/plan-request/*`, `/admin/*`) 와 분리. 스테이크홀더에게 v2 PRD
 * 의 핵심 surface 를 한 줄로 안내하기 위한 진입점.
 */
export default function V2MockIndex() {
  return (
    <main className="px-6 pt-10 pb-12 flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <ClaimStudioMark />
        <h1 className="text-2xl font-bold tracking-tight text-black">
          v2 PRD UI mock
        </h1>
        <p className="text-sm text-[#4b4b4b] leading-relaxed">
          CLAIM Studio 의 가짜 데이터 시안. 디테일은{" "}
          <Link
            href={{ pathname: "/" } as never}
            className="underline text-black"
          >
            prd-v2.md
          </Link>{" "}
          참조.
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        <MockLink
          href="/v2-mock/compare"
          title="워크스페이스 — 제안서가 채워진 상태"
          desc="origin 혼합 (업로드 / CLAIM 파트너) + 임시/정식 분석 + 슬롯 제거 + 제안서 추가 picker → 가입 게이트. v2 의 핵심 한 화면."
        />
        <MockLink
          href="/v2-mock/compare?state=empty"
          title="워크스페이스 — 처음 진입 (빈 상태)"
          desc="게스트가 CLAIM Studio 에 첫 도착. 두 entry CTA → 가입 modal → 카카오 OAuth → 온보딩 휴대폰 인증."
        />
      </ol>
    </main>
  );
}

function MockLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <li>
      <Link
        href={href as never}
        className="block rounded-xl border border-[#e2e2e2] p-4 hover:border-black transition-colors"
      >
        <div className="text-sm font-bold text-black">{title}</div>
        <p className="mt-1 text-xs text-[#4b4b4b] leading-relaxed">{desc}</p>
      </Link>
    </li>
  );
}
