/**
 * 생년월일 → 만 나이.
 *
 * `referenceDate` 미지정 시 호출 시점의 wall-clock 사용.
 * 주의: 서버 컴포넌트 렌더에서 호출하면 React 19 의 react-hooks/purity 룰에
 * 걸릴 수 있음 — 그 경우 `nowMs()` (lib/wall-clock.ts) 와 같은 외부 헬퍼로 시점을
 * 먼저 받아 referenceDate 로 주입.
 *
 * `birthDate` 형식: YYYY-MM-DD (zod 검증 후 호출 가정).
 */
export function ageFromBirthDate(
  birthDate: string,
  referenceDate?: Date,
): number {
  const ref = referenceDate ?? new Date();
  const birth = new Date(birthDate);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}

/** 만 나이 → "30대" 등의 라벨. 90+ 는 "90대 이상". */
export function ageDecadeLabel(age: number): string {
  if (age >= 90) return "90대 이상";
  if (age >= 60) return "60대 이상";
  const decade = Math.floor(age / 10) * 10;
  return `${decade}대`;
}
