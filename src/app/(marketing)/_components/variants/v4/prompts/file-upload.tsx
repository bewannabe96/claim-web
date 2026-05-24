"use client";

import { useRef, useState, useTransition } from "react";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { Button } from "@/components/ui/button";
import { presignExternalProposal } from "@/features/plan-requests/actions";
import { cn } from "@/lib/utils";

/**
 * Q4_9 — 외부 설계안 업로드 위젯 (PDF + 이미지).
 *
 * 흐름:
 *   1. 사용자가 파일 선택 → presignExternalProposal(file.type) 로 S3 키 +
 *      presigned PUT URL 발급 → 브라우저가 직접 S3 에 PUT → 키만 state 에 push.
 *   2. 최대 5건. 추가/삭제 가능.
 *   3. "다 됐어요" 클릭 시 onConfirm(keys) → chatbot-shell 이 ChatState 의
 *      externalProposalKeys 에 set 후 Q5 로 전이.
 *
 * partner proposal-form.tsx 의 2-step 업로드 패턴과 동일 — 파일 바이트는 우리
 * 서버를 거치지 않음 (Vercel 4.5MB body limit 회피 + 메모리 효율).
 *
 * 파일 형식: PDF (`application/pdf`) + 이미지 (JPG/PNG/WebP/HEIC/HEIF). iOS
 * 카메라 기본 HEIC 도 허용 — 가입자가 카카오톡으로 받은 사진을 그대로 첨부 가능.
 * accept 속성 + server 의 mime 화이트리스트 + presigned URL 의 ContentType 서명
 * 으로 다른 형식은 PUT 자체가 signature mismatch.
 *
 * **chatbot-shell 의 ChatState 와 분리된 로컬 state** 로 시작 — 업로드 중 파일이
 * shell state 에 잠시 보이면 안 됨 (실패 시 키만 누락된 row 가 됨). 완료된 키만
 * onConfirm 으로 상위에 전달.
 */
const ACCEPT_ATTR = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";
const ACCEPTED_MIME_PREFIXES = ["application/pdf", "image/"];
export function FileUpload({
  initialKeys,
  maxCount = 5,
  onConfirm,
}: {
  initialKeys: string[];
  maxCount?: number;
  onConfirm: (keys: string[]) => void;
}) {
  // 업로드 완료된 항목들 — 파일명은 사용자 식별용 (S3 키는 nanoid 라 사용자에겐 무의미).
  const [items, setItems] = useState<UploadedItem[]>(() =>
    initialKeys.map((s3Key) => ({ s3Key, displayName: extractDisplay(s3Key) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = items.length >= maxCount;

  function handleFileSelected(file: File) {
    setError(null);

    if (!ACCEPTED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
      setError("PDF 또는 사진 파일만 첨부할 수 있어요.");
      return;
    }
    // 클라이언트 사전 size 검증 — 서버 PROPOSAL_PDF_MAX_BYTES (10MB) 와 일치.
    // 정확한 강제는 S3 PUT 응답 / HEAD 검증 단계 (향후 추가 시).
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) {
      setError("파일 크기는 10MB 이하만 가능해요.");
      return;
    }

    startTransition(async () => {
      const presign = await presignExternalProposal(file.type);
      if (!presign.ok) {
        setError(presign.message);
        return;
      }
      try {
        const res = await fetch(presign.url, {
          method: "PUT",
          // file.type 그대로 — presigned URL 의 ContentType 서명과 일치해야 PUT 통과.
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) {
          setError("업로드에 실패했어요. 잠시 후 다시 시도해주세요.");
          return;
        }
      } catch {
        setError("네트워크 오류로 업로드에 실패했어요.");
        return;
      }

      setItems((s) => [
        ...s,
        { s3Key: presign.s3Key, displayName: file.name },
      ]);
    });
  }

  function handleRemove(idx: number) {
    setItems((s) => s.filter((_, i) => i !== idx));
  }

  function openPicker() {
    if (atLimit || isPending) return;
    inputRef.current?.click();
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
          // 같은 파일 재선택 가능하도록 value 비움.
          if (inputRef.current) inputRef.current.value = "";
        }}
      />

      {/* 업로드된 파일 목록 — 파일명 = PII 가능성, 통째로 NO_TRACK */}
      {items.length > 0 && (
        <ul className={cn("flex flex-col gap-2", NO_TRACK_CLASS)}>
          {items.map((item, idx) => (
            <li
              key={item.s3Key}
              className="flex items-center justify-between gap-3 rounded-lg border border-[#e2e2e2] bg-white px-3 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm text-black">
                <FileIcon />
                <span className="truncate">{item.displayName}</span>
              </span>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="shrink-0 text-xs text-[#4b4b4b] underline hover:text-black"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 추가 / 다 됐어요 */}
      <button
        type="button"
        onClick={openPicker}
        disabled={atLimit || isPending}
        className={cn(
          "h-12 rounded-lg border-2 border-dashed text-sm font-medium transition-colors",
          atLimit || isPending
            ? "cursor-not-allowed border-[#e2e2e2] text-[#afafaf]"
            : "border-[#e2e2e2] text-black hover:border-black hover:bg-[#fafafa]",
        )}
      >
        {isPending
          ? "업로드 중..."
          : atLimit
            ? `최대 ${maxCount}건까지 첨부 가능해요`
            : items.length === 0
              ? "+ PDF · 사진 첨부"
              : "+ 더 추가"}
      </button>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      <Button
        type="button"
        onClick={() => onConfirm(items.map((i) => i.s3Key))}
        disabled={items.length === 0 || isPending}
        className="h-14 w-full rounded-full text-sm font-medium"
      >
        다 됐어요
      </Button>
    </div>
  );
}

type UploadedItem = {
  s3Key: string;
  displayName: string;
};

/**
 * 키에서 사용자 표시명 추출. nanoid.pdf 라 사용자에겐 의미 없어 prefix 제거한
 * 파일명 그대로. initialKeys (재진입) 케이스의 폴백 — 정상 흐름은 업로드 시점에
 * file.name 으로 저장.
 */
function extractDisplay(s3Key: string): string {
  const last = s3Key.split("/").pop() ?? s3Key;
  return last;
}

/**
 * 첨부 파일 아이콘 — paper clip (PDF / 이미지 공통 표현). 파일명 자체에 확장자가
 * 보이므로 아이콘은 형식 구분 없이 generic.
 */
function FileIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-[#4b4b4b]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.5 5.5L5.7 10.3a1.5 1.5 0 0 0 2.12 2.12l5.66-5.66a3 3 0 0 0-4.24-4.24L3.58 8.18a4.5 4.5 0 0 0 6.36 6.36l4.6-4.6" />
    </svg>
  );
}
