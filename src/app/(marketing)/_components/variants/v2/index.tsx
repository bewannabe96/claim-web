import { BrandMark } from "@/components/brand-mark";

import { LandingCtaButton } from "../../landing-cta-button";

/**
 * 랜딩 변형 V2 — a8fc490 이전의 정적 narrative 랜딩 (Problem / Solution /
 * Closing CTA 구조) 을 A/B 테스트용으로 복원.
 *
 * 내레이션 구조: Hero → 01 Problem → 02 How it works → 03 Solution →
 *               Closing CTA → Footer.
 *
 * 480px 모바일 컨테이너 안에서 세로로 흐르는 long-scroll 랜딩. 색은 흑백/그레이만
 * 사용 (DESIGN.md 모노크롬 시스템). 섹션 간 시각 리듬은 배경 토글
 * (white ↔ #f7f7f7) 과 섹션 라벨 ("01 — Problem") 로만 만든다.
 *
 * v1 (인터랙티브 데모) 과의 가설 비교: v2 는 텍스트 narrative 만으로 가치제안을
 * 풀어내는 클래식 LP. Hero 에서 한 번, Closing 에서 한 번 — CTA 2 회 노출.
 *
 * # 변형 디렉토리 규칙
 *
 * 외부 의존은 v1, v2 가 공유하는 [LandingCtaButton](../../landing-cta-button.tsx)
 * 단 하나뿐 — 그래서 _components/ 루트에 그대로 둠. 다른 변형이 import 하지 않는
 * 헬퍼/섹션 컴포넌트는 모두 이 파일 안에 인라인 (변형 추가/삭제 시 의존성 폭발
 * 방지). 만약 v3 가 같은 ProblemCard 등을 쓰게 되면 그 시점에 `_components/shared/`
 * 로 승격.
 */
export function VariantV2({
  googleAdsConversionTarget,
}: {
  googleAdsConversionTarget: string | undefined;
}) {
  return (
    <main className="flex flex-1 flex-col bg-white">
      <Hero googleAdsConversionTarget={googleAdsConversionTarget} />
      <ProblemSection />
      <HowItWorksSection />
      <SolutionSection />
      <ClosingSection googleAdsConversionTarget={googleAdsConversionTarget} />
      <Footer />
    </main>
  );
}

/* ------------------------------------------------------------------
 * Hero
 * ------------------------------------------------------------------ */

function Hero({
  googleAdsConversionTarget,
}: {
  googleAdsConversionTarget: string | undefined;
}) {
  return (
    <section className="px-6 pt-10 pb-14">
      <BrandMark />

      <h1 className="mt-8 text-[2rem] font-bold leading-[1.22] tracking-tight text-black">
        설계사가 제안하고,
        <br />
        AI가 비교하고,
        <br />
        당신은 선택합니다.
      </h1>

      <p className="mt-4 text-sm leading-relaxed text-[#4b4b4b]">
        요청서 한 번 남기면, 별도 연락 없이
        <br />
        가입설계 제안서가 도착해요.
        <br />
        어떤 상황에 얼마 받을 수 있는지,
        <br />
        AI가 정리해드립니다.
      </p>

      <div className="mt-10">
        <LandingCtaButton
          className="h-14 w-full rounded-full text-base font-medium"
          googleAdsConversionTarget={googleAdsConversionTarget}
        >
          요청서 작성하고 제안 받기
        </LandingCtaButton>
        <p className="mt-3 text-center text-xs text-[#8a8a8a]">
          1분이면 충분해요 · 상담 전화 없음
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
 * 01 — Problem
 * ------------------------------------------------------------------ */

function ProblemSection() {
  return (
    <section className="border-t border-[#ececec] bg-[#f7f7f7] px-6 pt-14 pb-14">
      <SectionLabel index="01" label="Problem" />
      <SectionHeadline>
        보험 가입할 때,
        <br />
        다들 이러시지 않나요?
      </SectionHeadline>
      <p className="mt-4 text-sm leading-relaxed text-[#4b4b4b]">
        보험은 평생 한 번이 아닌, 평생 함께해야 하는 결정.
        <br />그 과정이 왜 이렇게 피곤해야 할까요.
      </p>

      <div className="mt-10 flex flex-col gap-4">
        <ProblemCard
          index="01"
          title="보험 가입하려 했더니, 영업 전화만"
          body="번호 한 번 남겼을 뿐인데, 모르는 번호로 며칠째 전화가 와요."
        />
        <ProblemCard
          index="02"
          title="설계안 받아봐도, 좋은 건지 모르겠어요"
          body="외계어 같은 보험 용어들, 한 줄 한 줄 읽어도 이해가 안 돼요."
        />
        <ProblemCard
          index="03"
          title="어떤 상황에 얼마 받는지 모르겠어요"
          body="가입하면 진짜 도움 되는 건지, 얼마나 보장받는지 헷갈려요."
        />
      </div>
    </section>
  );
}

function ProblemCard({
  index,
  title,
  body,
}: {
  index: string;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-2xl border border-[#e2e2e2] bg-white p-5">
      <span className="font-mono text-[0.7rem] tracking-[0.12em] text-[#8a8a8a]">
        PROBLEM {index}
      </span>
      <h3 className="mt-2 text-[1.0625rem] font-semibold leading-snug text-black">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[#4b4b4b]">{body}</p>
    </article>
  );
}

/* ------------------------------------------------------------------
 * 02 — How it works
 * ------------------------------------------------------------------ */

function HowItWorksSection() {
  return (
    <section className="border-t border-[#ececec] bg-white px-6 pt-14 pb-14">
      <SectionLabel index="02" label="How it works" />
      <SectionHeadline>
        요청 한 번이면,
        <br />
        선택만 남습니다
      </SectionHeadline>
      <p className="mt-4 text-sm leading-relaxed text-[#4b4b4b]">
        가입자는 설계사를 찾지 않습니다.
        <br />
        설계사가 먼저 제안하고, AI가 비교합니다.
      </p>

      <ol className="mt-10 flex flex-col">
        <StepRow
          index="01"
          eyebrow="Request"
          title="요청서를 남기세요"
          body="어떤 보험이 필요한지 1분 안에 입력하면 끝. 가입자가 직접 설계사를 찾을 필요 없습니다."
        />
        <StepRow
          index="02"
          eyebrow="Receive"
          title="설계사가 제안서를 보냅니다"
          body="별도 연락 없이 가입설계 제안서만 도착해요. 여러 설계사의 안을 한 번에 받아봅니다."
        />
        <StepRow
          index="03"
          eyebrow="Select"
          title="AI 비교 결과로 선택하세요"
          body="보장 내역과 예상 수령액을 AI가 정리해 보여드립니다. 마음에 드는 제안을 선택하면 끝."
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
  body: string;
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
 * 03 — Solution
 * ------------------------------------------------------------------ */

function SolutionSection() {
  return (
    <section className="border-t border-[#ececec] bg-[#f7f7f7] px-6 pt-14 pb-14">
      <SectionLabel index="03" label="Solution" />
      <SectionHeadline>
        세 가지 불편을,
        <br />
        AI 한 번에 해결합니다
      </SectionHeadline>
      <p className="mt-4 text-sm leading-relaxed text-[#4b4b4b]">
        앞서 짚은 세 가지 불편을 1:1로 풀어드립니다.
      </p>

      <div className="mt-10 flex flex-col gap-4">
        <SolutionCard
          index="01"
          mapsTo="01"
          title="별도 연락 없이, 제안서만 도착"
          body="요청서를 남기면 설계사들이 가입설계 제안서를 플랫폼으로 직접 보내드려요. 실제 계약할 설계사와만 대화하세요."
        />
        <SolutionCard
          index="02"
          mapsTo="02"
          title="복잡한 약관, AI가 쉽게 정리"
          body="어려운 보험 용어와 약관을 AI가 핵심만 추출해 평문으로 설명합니다. 한 줄 한 줄 해석하지 않아도 됩니다."
        />
        <SolutionCard
          index="03"
          mapsTo="03"
          title="어떤 상황에 얼마 받는지 한눈에"
          body="여러 제안서의 보장 내역과 예상 수령액을 AI가 비교 분석합니다. 가장 유리한 제안이 무엇인지 명확하게."
        />
      </div>
    </section>
  );
}

function SolutionCard({
  index,
  mapsTo,
  title,
  body,
}: {
  index: string;
  mapsTo: string;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-2xl border border-[#e2e2e2] bg-white p-5">
      <div className="flex items-center gap-2 font-mono text-[0.7rem] tracking-[0.12em] text-[#8a8a8a]">
        <span>SOLUTION {index}</span>
        <span aria-hidden className="text-[#c2c2c2]">
          ↳
        </span>
        <span>PROBLEM {mapsTo}</span>
      </div>
      <h3 className="mt-2 text-[1.0625rem] font-semibold leading-snug text-black">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[#4b4b4b]">{body}</p>
    </article>
  );
}

/* ------------------------------------------------------------------
 * Closing CTA
 * ------------------------------------------------------------------ */

function ClosingSection({
  googleAdsConversionTarget,
}: {
  googleAdsConversionTarget: string | undefined;
}) {
  return (
    <section className="border-t border-[#ececec] bg-black px-6 pt-16 pb-16 text-white">
      <h2 className="text-[1.75rem] font-bold leading-[1.25] tracking-tight">
        지금 요청서를 남기고
        <br />
        제안서를 받아보세요
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-[#bdbdbd]">
        설계사를 직접 찾지 않아도, 설계사가 먼저 제안합니다.
        <br />
        AI 비교로 가장 유리한 안을 고르세요.
      </p>

      <div className="mt-10">
        <LandingCtaButton
          variant="secondary"
          className="h-14 w-full rounded-full bg-white text-base font-medium text-black hover:bg-[#e2e2e2]"
          googleAdsConversionTarget={googleAdsConversionTarget}
        >
          요청서 작성하고 제안 받기
        </LandingCtaButton>
        <p className="mt-3 text-center text-xs text-[#8a8a8a]">
          1분이면 충분해요 · 상담 전화 없음
        </p>
      </div>
    </section>
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

/* ------------------------------------------------------------------
 * 섹션 공통 chrome
 * ------------------------------------------------------------------ */

function SectionLabel({ index, label }: { index: string; label: string }) {
  return (
    <p className="font-mono text-[0.75rem] tracking-[0.14em] text-[#8a8a8a] uppercase">
      <span className="text-black">{index}</span>
      <span className="mx-2 text-[#c2c2c2]">—</span>
      <span>{label}</span>
    </p>
  );
}

function SectionHeadline({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-4 text-[1.75rem] font-bold leading-[1.25] tracking-tight text-black">
      {children}
    </h2>
  );
}
