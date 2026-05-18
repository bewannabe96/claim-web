/**
 * Prisma 6 config — `prisma.config.ts` 가 존재하면 Prisma CLI 가 .env 자동 로딩을
 * 스킵하므로 (`Prisma config detected, skipping environment variable loading.`),
 * 여기서 명시적으로 dotenv 로 로드한다.
 *
 * 우선순위 (Next.js 와 동일하게):
 *   1. 프로세스 env (shell export — 예: `pnpm db:push` 가 source 하는 `scripts/db-env.sh`)
 *   2. .env.local
 *   3. .env
 *
 * dotenv 의 기본값 `override: false` 는 "이미 process.env 에 있으면 skip" 이므로
 * `.env.local → .env` 순서로 호출하면 위 우선순위가 자연스럽게 성립.
 */
import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

config({ path: '.env.local' })
config({ path: '.env' })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
})
