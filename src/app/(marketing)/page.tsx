import { HeroExperience } from "./_components/hero-experience";
import { StickyBottomCta } from "./_components/sticky-bottom-cta";

/**
 * 마케팅 랜딩 — 가입자(고객) 진입 페이지.
 *
 * 구조: Hero(스크롤 반응형 제품 화면) → How it works
 *
 * 요청서 작성 CTA 는 Hero 데모의 zone 3 에 임팩트 있게 한 번만 둔다 (별도
 * Closing CTA 섹션은 중복이라 제거).
 *
 * 진입 즉시 인터랙티브 비교 화면을 보여준다. 헤드라인
 * "설계사가 제안하고 · AI가 비교하고 · 당신은 선택합니다" 는 단 한 곳(Hero)에만
 * 쓰고, 스크롤하면 상단에 고정돼 데모의 현재 zone 에 맞춰 구절이 하이라이트된다 —
 * 각 구역에 같은 문구를 반복하지 않고 헤드라인이 곧 진행 가이드.
 *
 * 480px 모바일 컨테이너 안 세로 long-scroll. 색은 흑백/그레이만
 * (DESIGN.md 모노크롬 시스템). 섹션은 스크롤에 맞춰 등장(.reveal).
 */
export default function Home() {
  // Server Component 에서 env 읽어 client CTA 에 prop drilling — 프로젝트 규약상
  // NEXT_PUBLIC_ prefix 금지 (.env.example 참조).
  //
  // gtag 의 두 호출은 send_to 형식이 다르다:
  //   - 베이스 스크립트의 gtag('config', …) 는 계정 ID `AW-XXXXXXXXXX` 만 (layout.tsx).
  //   - conversion 이벤트의 send_to 는 `AW-XXXXXXXXXX/<label>` — conversion action
  //     마다 발급되는 label 을 붙여야 Google Ads 에 conversion 으로 매핑된다.
  // 그래서 계정 ID 와 label 을 별도 env 로 받아 여기서 합성한다. 둘 중 하나라도
  // 미설정이면 undefined → CTA 가 gtag 발화를 스킵 (dev/staging 에서 무해).
  const googleAdsId = process.env.GOOGLE_ADS_ID;
  const googleAdsConversionLabel = process.env.GOOGLE_ADS_CONVERSION_LABEL;
  const googleAdsConversionTarget =
    googleAdsId && googleAdsConversionLabel
      ? `${googleAdsId}/${googleAdsConversionLabel}`
      : undefined;

  return (
    <main className="flex flex-1 flex-col bg-white">
      <HeroExperience googleAdsConversionTarget={googleAdsConversionTarget} />
      <HowItWorksSection />
      <Footer />
      <StickyBottomCta googleAdsConversionTarget={googleAdsConversionTarget} />
    </main>
  );
}

/* ------------------------------------------------------------------
 * How it works
 * ------------------------------------------------------------------ */

function HowItWorksSection() {
  return (
    <section className="border-t border-[#ececec] bg-[#f7f7f7] px-6 pt-14 pb-24">
      <h2 className="reveal text-[1.75rem] font-bold leading-[1.25] tracking-tight text-black">
        요청 한 번이면,
        <br />
        선택만 남습니다
      </h2>
      <p className="reveal mt-4 text-sm leading-relaxed text-[#4b4b4b]">
        설계사를 직접 찾지 않아도 돼요.
        <br />
        설계사가 먼저 제안하고, AI가 비교합니다.
      </p>

      <ol className="reveal mt-10 flex flex-col">
        <StepRow
          index="01"
          eyebrow="Request"
          title="요청서를 남기세요"
          body={
            <>
              어떤 보험이 필요한지 1분 안에 입력하면 끝.
              <br />
              직접 설계사를 찾을 필요 없습니다.
            </>
          }
        />
        <StepRow
          index="02"
          eyebrow="Receive"
          title="설계사가 제안서를 보냅니다"
          body={
            <>
              별도 연락 없이 가입설계 제안서만 도착해요.
              <br />
              여러 설계사의 안을 한 번에 받아봅니다.
            </>
          }
        />
        <StepRow
          index="03"
          eyebrow="Select"
          title="AI 비교 결과로 선택하세요"
          body={
            <>
              위에서 만져본 그 화면으로 받아봅니다.
              <br />
              마음에 드는 제안을 선택하면 끝.
            </>
          }
          isLast
        />
      </ol>
    </section>
  );
}

function StepRow({
  index,
  eyebrow,
  title,
  body,
  isLast = false,
}: {
  index: string;
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <li className="relative flex gap-4">
      {/* number column with vertical connector */}
      <div className="flex flex-col items-center">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black font-mono text-[0.75rem] font-bold text-white">
          {index}
        </div>
        {!isLast && <span className="mt-1 w-px flex-1 bg-[#e2e2e2]" />}
      </div>

      <div className={isLast ? "pb-0" : "pb-8"}>
        <p className="font-mono text-[0.7rem] tracking-[0.12em] text-[#8a8a8a] uppercase">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-[1.0625rem] font-semibold leading-snug text-black">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[#4b4b4b]">{body}</p>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------
 * Footer
 * ------------------------------------------------------------------ */

function Footer() {
  // 설계사 가입 진입점은 별도 폼(Google Form 등) — env 로 주입. 미설정 시 링크 숨김.
  const agentSignupUrl = process.env.AGENT_SIGNUP_URL;

  return (
    <footer className="border-t border-[#1a1a1a] bg-black px-6 py-10">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-wide text-white">CLAIM</p>
        {agentSignupUrl && (
          <a
            href={agentSignupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#8a8a8a] underline-offset-4 hover:text-white hover:underline"
          >
            설계사이신가요?
          </a>
        )}
      </div>

      <div className="mt-6 border-t border-[#1a1a1a] pt-6">
        <p className="text-[0.8125rem] font-semibold text-white">
          인슈파이어(주)
        </p>
        <dl className="mt-3 flex flex-col gap-1.5 text-[0.7rem] leading-relaxed text-[#8a8a8a]">
          <FooterMetaRow label="대표" value="한성재, 김민준" />
          <FooterMetaRow label="사업자등록번호" value="313-87-03205" />
          <FooterMetaRow label="통신판매번호" value="제2025-경기파주-0329" />
          <FooterMetaRow label="주소" value="경기도 파주시 경의로 1024, 918호" />
          <FooterMetaRow label="연락처" value="070-8879-1018" />
          <FooterMetaRow
            label="이메일"
            value={
              <a
                href="mailto:insupire@naver.com"
                className="hover:text-white hover:underline"
              >
                insupire@naver.com
              </a>
            }
          />
        </dl>
      </div>

      <p className="mt-6 text-[0.7rem] text-[#6a6a6a]">
        © 2026 Insupire Co., Ltd. All rights reserved.
      </p>
    </footer>
  );
}

function FooterMetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-[5.5rem] shrink-0 text-[#6a6a6a]">{label}</dt>
      <dd className="flex-1 break-keep text-[#a8a8a8]">{value}</dd>
    </div>
  );
}
