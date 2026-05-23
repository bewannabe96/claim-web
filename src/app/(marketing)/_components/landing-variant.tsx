import type { VariantId } from "@/lib/lp-variant";

import { VariantV1 } from "./variants/v1";
import { VariantV2 } from "./variants/v2";

/**
 * 랜딩 변형 dispatcher — Server Component.
 *
 * page.tsx 가 cookie / Redis 로 결정한 `variant` 를 받아 해당 변형 컴포넌트로
 * 분기. 새 변형 추가는:
 *   1. [src/lib/lp-variant.ts](../../../lib/lp-variant.ts) 의 `VARIANT_IDS` 에 id 추가
 *   2. [variants/v2/index.tsx](variants/v2/index.tsx) 같은 파일 생성 +
 *      `VariantV2` export
 *   3. 아래 switch 에 case 추가
 * 두 단계 중 하나라도 누락되면 exhaustive 타입체크가 빌드 단계에서 잡는다.
 *
 * **공유 props**: 모든 변형이 동일 시그니처를 가져야 dispatch 가 깔끔. 현재는
 * `googleAdsConversionTarget` 한 개만. CTA 가 변형마다 달라도 conversion 발화
 * 책임은 동일하므로 이 prop 은 변형 공통 인터페이스.
 */
type Props = {
  variant: VariantId;
  googleAdsConversionTarget: string | undefined;
};

export function LandingVariant({ variant, googleAdsConversionTarget }: Props) {
  switch (variant) {
    case "v1":
      return (
        <VariantV1 googleAdsConversionTarget={googleAdsConversionTarget} />
      );
    case "v2":
      return (
        <VariantV2 googleAdsConversionTarget={googleAdsConversionTarget} />
      );
    default: {
      // Exhaustive 체크 — VARIANT_IDS 늘리고 case 안 늘리면 type error.
      const _exhaustive: never = variant;
      void _exhaustive;
      // 런타임 안전망: 알 수 없는 변형은 control 로 fallback.
      return (
        <VariantV1 googleAdsConversionTarget={googleAdsConversionTarget} />
      );
    }
  }
}
