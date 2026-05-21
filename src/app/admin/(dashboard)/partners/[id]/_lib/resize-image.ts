/**
 * 브라우저에서 프로필 사진을 300x300 정사각형 WebP 로 리사이즈.
 *
 * cover 방식 — 짧은 변을 300 에 맞춰 스케일, 긴 변은 중앙 기준으로 잘림. 원본은
 * 어떤 비율이어도 정사각형 결과물.
 *
 * createImageBitmap 로 디코딩 — `imageOrientation: "from-image"` 가 EXIF 회전을
 * 자동 적용해줘서 세로/가로 뒤집힌 폰 사진 문제 없음.
 */

const TARGET_SIZE = 300;
const WEBP_QUALITY = 0.85;

export async function resizeToSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    const scale = TARGET_SIZE / Math.min(bitmap.width, bitmap.height);
    const drawW = bitmap.width * scale;
    const drawH = bitmap.height * scale;
    const dx = (TARGET_SIZE - drawW) / 2;
    const dy = (TARGET_SIZE - drawH) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas-context-unavailable");

    ctx.drawImage(bitmap, dx, dy, drawW, drawH);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("toBlob-returned-null")),
        "image/webp",
        WEBP_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}
