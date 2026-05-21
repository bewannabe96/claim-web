import "server-only";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

import { newId } from "@/lib/id";

/**
 * 서비스 컨텐츠 (이미지/사진 등) 버킷 헬퍼.
 *
 * 제안서 PDF (`s3.ts` 의 `S3_BUCKET_PROPOSALS`) 와 분리된 버킷 (`S3_BUCKET_CONTENT`)
 * — public read prefix 가 있는 컨텐츠 전용. 인프라: `infra/content-bucket/`.
 *
 * 흐름 (파트너 프로필 사진):
 *   1. `presignPartnerAvatarUpload(partnerId, contentType)` → presigned PUT URL +
 *      s3Key. 클라가 직접 PUT (Content-Type + Cache-Control 헤더 같이).
 *   2. `verifyPartnerAvatarObject(s3Key)` → HEAD 로 size + content-type 검증.
 *   3. `partnerAvatarPublicUrl(s3Key)` → `<bucket>.s3.<region>.amazonaws.com/<key>`
 *      형태의 공개 URL 생성 (CDN 도입 시 `CONTENT_PUBLIC_BASE_URL` env override).
 *   4. (선택) `deleteContentObject(s3Key)` → 교체 시 구 객체 청소 (best-effort).
 */

const ENV_SCHEMA = z.object({
  AWS_REGION: z.string().min(1, "AWS_REGION missing"),
  AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID missing"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY missing"),
  S3_BUCKET_CONTENT: z.string().min(1, "S3_BUCKET_CONTENT missing"),
  /**
   * CDN 또는 커스텀 도메인 base URL. 미설정 시 virtual-hosted S3 URL 로 폴백.
   * 예: `https://content.example.com` (CloudFront 얹은 후).
   */
  CONTENT_PUBLIC_BASE_URL: z.string().url().optional().or(z.literal("")),
});

type ContentEnv = z.infer<typeof ENV_SCHEMA>;

let cached: { env: ContentEnv; client: S3Client } | null = null;

function getClient(): { env: ContentEnv; client: S3Client } {
  if (cached) return cached;
  const env = ENV_SCHEMA.parse({
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    S3_BUCKET_CONTENT: process.env.S3_BUCKET_CONTENT,
    CONTENT_PUBLIC_BASE_URL: process.env.CONTENT_PUBLIC_BASE_URL,
  });
  const client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
    // SDK v3.5+ default 가 "WHEN_SUPPORTED" — 브라우저 PUT 에서 signature mismatch.
    // s3.ts 와 동일 정책.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  cached = { env, client };
  return cached;
}

/* ============================================================
 * 파트너 프로필 사진
 * ============================================================ */

export const PARTNER_AVATAR_PREFIX = "partners/avatar/";

export const PARTNER_AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5MB

/** 허용 MIME → 확장자. 클라이언트 File.type 이 이 키 안에 있어야 presign 통과. */
export const PARTNER_AVATAR_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type PartnerAvatarContentType = keyof typeof PARTNER_AVATAR_TYPES;

export function isPartnerAvatarContentType(
  s: string,
): s is PartnerAvatarContentType {
  return s in PARTNER_AVATAR_TYPES;
}

/**
 * 파트너 프로필 사진 업로드용 presigned PUT URL 발급.
 *
 * Key 형태: `partners/avatar/{partnerId}/{nanoid}.{ext}`. partnerId 가 path 에
 * 박혀 있어 finalize 단계에서 "본인 partner 의 key 인지" 검증 가능.
 *
 * URL TTL: 10분. ContentType 강제 — 클라가 다른 타입으로 PUT 하면 signature mismatch.
 * Cache-Control 도 함께 서명 — 클라가 동일 헤더 전송 시 객체 메타데이터에 저장돼
 * 후속 GET 응답에 그대로 박힘 (브라우저 캐시 1년 + immutable, 키에 nanoid 박혀 안전).
 */
export async function presignPartnerAvatarUpload(
  partnerId: string,
  contentType: PartnerAvatarContentType,
): Promise<{ url: string; s3Key: string; cacheControl: string }> {
  const { env, client } = getClient();
  const ext = PARTNER_AVATAR_TYPES[contentType];
  const s3Key = `${PARTNER_AVATAR_PREFIX}${partnerId}/${newId()}.${ext}`;
  const cacheControl = "public, max-age=31536000, immutable";
  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET_CONTENT,
    Key: s3Key,
    ContentType: contentType,
    CacheControl: cacheControl,
  });
  const url = await getSignedUrl(client, cmd, { expiresIn: 600 });
  return { url, s3Key, cacheControl };
}

/**
 * 업로드된 객체 검증 — finalize 액션에서 호출. 다음을 동시 검증:
 *   - 존재 여부
 *   - 크기 (PARTNER_AVATAR_MAX_BYTES 이하)
 *   - Content-Type (PARTNER_AVATAR_TYPES 안에 있는지)
 *
 * 반환:
 *   - 정상 → { size, contentType }
 *   - 미존재 → null
 *   - 크기 초과 → "too-large"
 *   - 잘못된 타입 → "invalid-type"
 */
export async function verifyPartnerAvatarObject(
  s3Key: string,
): Promise<
  | { size: number; contentType: PartnerAvatarContentType }
  | "too-large"
  | "invalid-type"
  | null
> {
  const { env, client } = getClient();
  try {
    const res = await client.send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET_CONTENT,
        Key: s3Key,
      }),
    );
    const size = res.ContentLength ?? 0;
    if (size > PARTNER_AVATAR_MAX_BYTES) return "too-large";
    const ct = res.ContentType ?? "";
    if (!isPartnerAvatarContentType(ct)) return "invalid-type";
    return { size, contentType: ct };
  } catch {
    return null;
  }
}

/**
 * 키가 우리가 발급한 패턴 + 해당 partner 소유인지 검증.
 * forgery 1차 방어선 (HEAD 와 함께).
 */
export function isPartnerAvatarKeyFor(
  s3Key: string,
  partnerId: string,
): boolean {
  const expectedPrefix = `${PARTNER_AVATAR_PREFIX}${partnerId}/`;
  if (!s3Key.startsWith(expectedPrefix)) return false;
  const suffix = s3Key.slice(expectedPrefix.length);
  return /^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(suffix);
}

/* ============================================================
 * 공개 URL / 객체 삭제 — 컨텐츠 버킷 전체 공용
 * ============================================================ */

/**
 * 공개 GET URL 생성. 컨텐츠 버킷의 모든 public_read_prefixes 에 동일 적용.
 *
 * `CONTENT_PUBLIC_BASE_URL` env 설정 시 그 도메인 사용 (CloudFront/커스텀 도메인).
 * 미설정 시 virtual-hosted S3 URL.
 */
export function contentPublicUrl(s3Key: string): string {
  const { env } = getClient();
  const base =
    env.CONTENT_PUBLIC_BASE_URL && env.CONTENT_PUBLIC_BASE_URL.length > 0
      ? env.CONTENT_PUBLIC_BASE_URL
      : `https://${env.S3_BUCKET_CONTENT}.s3.${env.AWS_REGION}.amazonaws.com`;
  return `${base}/${s3Key}`;
}

/**
 * 객체 삭제 — best-effort. 실패해도 throw 안 함 (로그만).
 *
 * 주 사용처: 프로필 사진 교체 시 구 객체 청소. 키가 사라져도 DB 상은 새 키로
 * 갱신 완료된 상태라 사용자 영향 없음.
 */
export async function deleteContentObject(s3Key: string): Promise<void> {
  const { env, client } = getClient();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET_CONTENT,
        Key: s3Key,
      }),
    );
  } catch (e) {
    console.warn("[content-storage] delete failed for", s3Key, e);
  }
}
