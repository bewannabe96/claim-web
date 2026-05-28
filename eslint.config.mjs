import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // `_` prefix 를 의도된 미사용으로 인정.
  // 예: 같은 interface 의 다른 구현체가 쓰지만 이 구현체는 안 쓰는 파라미터
  // (src/features/credits/payment/provider.ts PaymentProvider.verifyWebhook 의
  // stub/portone 분기처럼). 변수 / catch 에러도 같은 규칙.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/node_modules/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
