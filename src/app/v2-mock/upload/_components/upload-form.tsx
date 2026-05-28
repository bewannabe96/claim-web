"use client";

import { Camera, FileText, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { StickyBottomBar } from "@/components/sticky-bottom-bar";

import { ClaimStudioMark } from "../../_components/claim-studio-mark";

/* ============================================================
 * 외부 제안서 업로드 form — v2 PRD §4.2.
 *
 * 입력은 파일 1장이 전부. 보험사 / 상품명 / 보험료 / 설계사 이름 등 메타는
 * external_analyzer 가 파일에서 추출하므로 가입자에게 묻지 않음 (§5.2 의 메타 출처
 * 정책). 입력 단계 0 이 entry friction 의 dominant 절감 — G1 30초 약속의 절반
 * 가까이가 "파일 선택" 자체에 쓰임.
 *
 * Submit → 호출자 (UploadFlow) 가 즉시 `/v2-mock/compare?new=pending` 으로 navigate.
 * payload 전달 없음 — workspace 의 분석 중 슬롯이 진행 상태 표시 책임.
 * ============================================================ */
export function UploadForm({ onSubmit }: { onSubmit: () => void }) {
  const [fileName, setFileName] = useState<string>("");
  /** 사진 선택 시 미리보기 data URL. PDF 면 null. */
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  /** 파일 종류 — UI 분기. */
  const [fileKind, setFileKind] = useState<"image" | "pdf" | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const valid = fileName !== "";

  function handleFile(f: File | null | undefined) {
    if (!f) {
      setFileName("");
      setPreviewDataUrl(null);
      setFileKind(null);
      return;
    }
    setFileName(f.name);
    if (f.type.startsWith("image/")) {
      setFileKind("image");
      // FileReader → data URL. mock 단계라 cleanup 불필요 (state 갈리면 GC).
      const reader = new FileReader();
      reader.onload = () =>
        setPreviewDataUrl(typeof reader.result === "string" ? reader.result : null);
      reader.readAsDataURL(f);
    } else {
      setFileKind("pdf");
      setPreviewDataUrl(null);
    }
  }

  function clearFile() {
    handleFile(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSubmit();
  }

  return (
    <main className="flex-1 flex flex-col px-6 pt-10">
      <div className="flex items-center justify-between gap-3">
        <ClaimStudioMark />
        <Link
          href={"/v2-mock/compare?state=empty" as never}
          className="text-xs text-[#4b4b4b] hover:text-black"
        >
          ← 비교 도구
        </Link>
      </div>

      <header className="mt-8 flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
          제안서 업로드
        </h1>
        <p className="mt-1 text-sm text-[#4b4b4b] leading-relaxed">
          가지고 계신 제안서 1장만 올려주세요.
          <br />
          보험사·상품명·보험료는 분석기가 자동으로 인식해요.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mt-8 flex flex-col flex-1 gap-6"
        noValidate
      >
        {/* 숨겨진 input 2개 — 버튼이 click 으로 트리거 */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => handleFile(e.currentTarget.files?.[0])}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => handleFile(e.currentTarget.files?.[0])}
        />

        {fileName ? (
          <FilePreview
            fileName={fileName}
            fileKind={fileKind}
            previewDataUrl={previewDataUrl}
            onChangeClick={() => galleryInputRef.current?.click()}
            onClearClick={clearFile}
          />
        ) : (
          <FilePickerEmpty
            onCameraClick={() => cameraInputRef.current?.click()}
            onGalleryClick={() => galleryInputRef.current?.click()}
          />
        )}

        <p className="text-[10px] text-[#afafaf] leading-relaxed text-center">
          50MB 한도 · PDF / JPG / PNG / HEIC
        </p>

        <StickyBottomBar>
          <button
            type="submit"
            disabled={!valid}
            className="w-full h-14 rounded-full bg-black text-white text-base font-medium transition-colors hover:bg-[#1a1a1a] disabled:bg-[#efefef] disabled:text-[#4b4b4b]"
          >
            업로드 + 분석 시작
          </button>
        </StickyBottomBar>
      </form>
    </main>
  );
}

/* ============================================================
 * File picker — 선택 전 상태.
 *
 * 큰 photo-card 톤 영역 (PDF 아이콘 + 사진 아이콘 dual visual) + 두 액션 버튼:
 *   - [📷 사진 찍기]   — input capture=environment, 모바일 후면 카메라 직접
 *   - [📄 파일 선택]   — input accept=image/*+application/pdf, 일반 파일 선택
 *
 * 모바일에서 "PDF 로 변환" 단계 없이 종이 자료를 그대로 찍어 올릴 수 있다는
 * 시각 메시지가 한눈에 — PRD §5.2 의 entry friction 가설을 카피 외에 시각으로도 demonstrate.
 * ============================================================ */
function FilePickerEmpty({
  onCameraClick,
  onGalleryClick,
}: {
  onCameraClick: () => void;
  onGalleryClick: () => void;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-[#e2e2e2] bg-[#fafafa] px-4 py-6 flex flex-col items-center gap-4">
      {/* 듀얼 아이콘 — PDF + 사진 양쪽 지원을 시각으로. */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-1">
          <div className="h-12 w-12 rounded-xl bg-white border border-[#e2e2e2] flex items-center justify-center">
            <FileText
              size={22}
              strokeWidth={1.75}
              className="text-[#4b4b4b]"
            />
          </div>
          <span className="text-[10px] text-[#afafaf] font-medium">PDF</span>
        </div>
        <span aria-hidden className="text-[#afafaf] text-sm font-semibold">
          또는
        </span>
        <div className="flex flex-col items-center gap-1">
          <div className="h-12 w-12 rounded-xl bg-white border border-[#e2e2e2] flex items-center justify-center">
            <ImageIcon
              size={22}
              strokeWidth={1.75}
              className="text-[#4b4b4b]"
            />
          </div>
          <span className="text-[10px] text-[#afafaf] font-medium">사진</span>
        </div>
      </div>

      <p className="text-xs text-[#4b4b4b] text-center leading-relaxed">
        종이로 받은 제안서는
        <br />
        <b className="text-black">바로 카메라로 찍어서</b> 올려도 돼요
      </p>

      {/* 듀얼 액션 — 모바일: 카메라 직촬 가 1차 / 데스크탑: 사실상 갤러리만 의미 있음 */}
      <div className="w-full flex items-stretch gap-2">
        <button
          type="button"
          onClick={onCameraClick}
          className="flex-1 h-12 rounded-full bg-black text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-[#1a1a1a] transition-colors"
        >
          <Camera size={16} strokeWidth={2} />
          사진 찍기
        </button>
        <button
          type="button"
          onClick={onGalleryClick}
          className="flex-1 h-12 rounded-full border border-[#e2e2e2] bg-white text-black text-sm font-semibold flex items-center justify-center gap-1.5 hover:border-black transition-colors"
        >
          <FileText size={16} strokeWidth={2} />
          파일 선택
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * File preview — 선택 후 상태.
 *
 *   - 사진: thumbnail (data URL) + 파일명
 *   - PDF:  FileText 아이콘 + 파일명
 *
 * 우상단 X 로 초기화, 영역 자체 클릭으로 다른 파일 재선택 (gallery).
 * ============================================================ */
function FilePreview({
  fileName,
  fileKind,
  previewDataUrl,
  onChangeClick,
  onClearClick,
}: {
  fileName: string;
  fileKind: "image" | "pdf" | null;
  previewDataUrl: string | null;
  onChangeClick: () => void;
  onClearClick: () => void;
}) {
  return (
    <div className="rounded-xl border-2 border-[#1d4ed8] bg-[#e6f0ff] p-3 flex items-center gap-3">
      {/* 미리보기 */}
      <div className="shrink-0 h-16 w-16 rounded-lg overflow-hidden bg-white border border-[#1d4ed8]/30 flex items-center justify-center">
        {fileKind === "image" && previewDataUrl ? (
          // mock 단계 thumbnail. next/image 불필요 (data URL).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewDataUrl}
            alt="업로드한 사진 미리보기"
            className="h-full w-full object-cover"
          />
        ) : (
          <FileText size={28} strokeWidth={1.5} className="text-[#1d4ed8]" />
        )}
      </div>

      {/* 파일명 + 액션 */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <p className="text-sm font-semibold text-[#1d4ed8] truncate">
          {fileName}
        </p>
        <button
          type="button"
          onClick={onChangeClick}
          className="self-start text-[11px] text-[#4b4b4b] hover:text-black underline"
        >
          다른 파일 선택
        </button>
      </div>

      {/* X 버튼 — 선택 초기화 */}
      <button
        type="button"
        onClick={onClearClick}
        aria-label="선택 해제"
        className="shrink-0 h-7 w-7 rounded-full bg-white text-[#4b4b4b] hover:text-black border border-[#e2e2e2] flex items-center justify-center text-base"
      >
        ×
      </button>
    </div>
  );
}
