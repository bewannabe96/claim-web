"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  presignAvatarUploadForPartner,
  removePartnerAvatar,
  setPartnerAvatar,
} from "@/features/partners/actions";
import { cn } from "@/lib/utils";

import { resizeToSquareWebp } from "../_lib/resize-image";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const ACCEPT = ALLOWED_TYPES.join(",");
const MAX_BYTES = 5 * 1024 * 1024;

type Phase =
  | "idle"
  | "processing"
  | "presigning"
  | "uploading"
  | "finalizing"
  | "removing";

/**
 * 어드민 — 파트너 프로필 사진 업로드 (페이지 헤더 inline 변형).
 *
 * 원형 아바타 자체가 click 대상 — file picker 호출. 사진이 있으면 우상단 ✕ 으로
 * 제거. busy 상태는 아바타에 spinner overlay + label. 에러는 아래 row 에 표시.
 *
 * 흐름: 브라우저 리사이즈 (300x300 cover-crop + webp) → presignAvatarUploadForPartner →
 * S3 PUT (Content-Type + Cache-Control) → setPartnerAvatar (HEAD 검증 + DB 갱신).
 * 교체 시 구 키 청소는 서버 best-effort.
 */
export function AvatarUpload({
  partnerId,
  currentUrl,
}: {
  partnerId: string;
  /** 서버에서 매 렌더마다 새로 주입되는 현재 사진 URL — 업로드/삭제 후 router.refresh() 로 갱신. */
  currentUrl: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pending = phase !== "idle";
  const busyLabel =
    phase === "processing"
      ? "처리"
      : phase === "presigning"
        ? "준비"
        : phase === "uploading"
          ? "업로드"
          : phase === "finalizing"
            ? "저장"
            : phase === "removing"
              ? "삭제"
              : null;

  function pickFile() {
    if (pending) return;
    fileInputRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 가능하도록
    if (!file) return;

    const ct = file.type as (typeof ALLOWED_TYPES)[number];
    if (!ALLOWED_TYPES.includes(ct)) {
      setError("jpg · png · webp 만 가능합니다.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`최대 ${Math.floor(MAX_BYTES / 1024 / 1024)}MB 까지 가능합니다.`);
      return;
    }
    setError(null);

    startTransition(async () => {
      // 브라우저에서 300x300 cover-crop + webp 변환 — 업로드 전 단계. 어떤 입력
      // 포맷이어도 최종은 image/webp 라서 presign / PUT 도 webp 고정.
      setPhase("processing");
      let resized: Blob;
      try {
        resized = await resizeToSquareWebp(file);
      } catch {
        setPhase("idle");
        setError("이미지 처리에 실패했어요. 다른 사진으로 시도해주세요.");
        return;
      }

      setPhase("presigning");
      const presign = await presignAvatarUploadForPartner(
        partnerId,
        "image/webp",
      );
      if (!presign.ok) {
        setPhase("idle");
        setError(presign.error);
        return;
      }

      setPhase("uploading");
      try {
        const putRes = await fetch(presign.url, {
          method: "PUT",
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": presign.cacheControl,
          },
          body: resized,
        });
        if (!putRes.ok) {
          setPhase("idle");
          setError("업로드에 실패했어요. 다시 시도해주세요.");
          return;
        }
      } catch {
        setPhase("idle");
        setError("업로드에 실패했어요. 다시 시도해주세요.");
        return;
      }

      setPhase("finalizing");
      const finalize = await setPartnerAvatar(partnerId, presign.s3Key);
      if (!finalize.ok) {
        setPhase("idle");
        setError(finalize.error);
        return;
      }

      // 서버 컴포넌트 재페치 → 부모가 새 currentUrl prop 으로 재렌더 → <img> 가 새 사진 노출.
      // revalidatePath 만으론 현재 화면이 자동 새 데이터로 안 바뀜.
      router.refresh();
      setPhase("idle");
    });
  }

  function onRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (pending || !currentUrl) return;
    startTransition(async () => {
      setPhase("removing");
      const res = await removePartnerAvatar(partnerId);
      if (!res.ok) {
        setError(res.error);
      } else {
        router.refresh();
      }
      setPhase("idle");
    });
  }

  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div className="relative w-20 h-20">
        <button
          type="button"
          onClick={pickFile}
          disabled={pending}
          className={cn(
            "group block w-20 h-20 rounded-full overflow-hidden",
            "border border-[#efefef] bg-[#f2f2f2]",
            "transition-opacity disabled:opacity-60",
            !pending && "cursor-pointer",
          )}
          aria-label={currentUrl ? "프로필 사진 변경" : "프로필 사진 추가"}
        >
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="block w-full h-full" />
          )}

          {!pending && (
            <span
              className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors rounded-full"
              aria-hidden
            />
          )}

          {pending && (
            <span className="absolute inset-0 bg-black/60 text-white flex items-center justify-center text-[10px] font-medium rounded-full">
              {busyLabel}…
            </span>
          )}
        </button>

        {/* 카메라 배지 — 우하단. pointer-events-none 으로 클릭은 아바타 본체가 흡수. */}
        {!pending && (
          <span
            className={cn(
              "absolute bottom-0 right-0 w-7 h-7 rounded-full",
              "bg-black text-white border-2 border-white shadow-sm",
              "flex items-center justify-center pointer-events-none",
            )}
            aria-hidden
          >
            <CameraIcon />
          </span>
        )}

        {/* 제거 ✕ — 우상단. 사진이 있고 idle 일 때만. */}
        {currentUrl && !pending && (
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              "absolute -top-1 -right-1 w-5 h-5 rounded-full",
              "bg-white border border-[#e2e2e2] text-[#4b4b4b]",
              "flex items-center justify-center shadow-sm",
              "hover:bg-[#fafafa] hover:text-black",
            )}
            aria-label="프로필 사진 제거"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-red-600 max-w-[160px] text-center leading-tight">
          {error}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={onFile}
      />
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4l-1.5-2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="w-3 h-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
