"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { BrandMark } from "@/components/brand-mark";
import type { PriceTier } from "@/features/plan-request-pricing/schema";
import {
  autoSelectAndAdvance,
  finalizeRequest,
  sendOtp,
  submitStep1,
} from "@/features/plan-requests/actions";
import {
  type CoverageIntent,
  type FocusedConcernId,
  type MedicalHistoryEntry,
} from "@/features/plan-requests/schema";
import type { Gender } from "@/types";

import { BotBubble } from "./messages/bot-bubble";
import { UserBubble } from "./messages/user-bubble";
import { PromptSlot } from "./prompts/prompt-slot";

/**
 * ChatbotShell — v4 챗봇 변형의 풀스크린 셸.
 *
 * 레이아웃 (위→아래):
 *   1. 헤더 (CLAIM 브랜드만)
 *   2. 메시지 로그 스크롤 영역 (flex-1, auto scroll bottom on new entry)
 *   3. 하단 고정 입력 슬롯 (현재 phase 에 맞는 위젯 1개)
 *
 * 사용자 응답은 user bubble 로 로그에 push 되고, 슬롯은 다음 phase 위젯으로
 * 교체된다. 페이지 전환 0 — Phase 1 (Step1) / Phase 2 (자동 후보 배정) /
 * Phase 3 (본인인증) 모두 이 셸 안에서 server action 호출로 진행, finalize
 * 성공 시에만 마지막에 `/plan-request/{id}/dispatched` 로 navigate.
 *
 * **단일 client component 로 통합** — 페이지 전환이 없어 state lift up 필요가
 * 없고, advance() 한 reducer 로 전체 흐름을 일관되게 관리. 슬롯의 입력 위젯
 * 들은 `prompts/` 하위에 분리해 PromptSlot 이 phase 별로 dispatch.
 */
export function ChatbotShell({ priceTiers }: { priceTiers: PriceTier[] }) {
  const [state, setState] = useState<ChatState>(() => initialChatState());
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  /* ─── 자동 스크롤 ─────────────────────────────────────────
   * 새 메시지 / phase 전이 / 슬롯 위젯 교체 직후 컨테이너 끝으로 자동 스크롤.
   *
   * `scrollIntoView` 는 호출 시점의 layout 만 보고 동작하므로 새 메시지 DOM 이
   * 마운트 되기 전 phase=PROC1/PROC3 의 SystemLoadingBubble 등이 추가되는
   * 경우 race 가 발생할 수 있다. requestAnimationFrame 으로 다음 paint 후
   * 컨테이너의 scrollHeight 기준으로 직접 scrollTop 을 설정 — sticky bottom
   * 슬롯 높이가 바뀌어도 (예: text-input → medical-card) 정확히 끝으로 이동.
   *
   * behavior: "smooth" 는 모바일에서 종종 무시되거나 cancel 되므로 명시 X
   * (default = auto = instant).
   */
  useEffect(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [state.log.length, state.phase]);

  /* ─── 백그라운드 처리 트리거 ───────────────────────────────
   * Phase 1 → PROC1 (submitStep1 + autoSelectAndAdvance) → Phase 3
   * Phase 3 끝 → PROC3 (finalizeRequest) → dispatched 페이지
   * 둘 다 phase 전이 즉시 실행. effect 안에서 startTransition 으로 server
   * action 호출 → 응답에 따라 다음 phase 로 setState.
   */
  useEffect(() => {
    if (state.phase === "PROC1") {
      runPhase1Submission(state, setState, startTransition);
    } else if (state.phase === "PROC3") {
      runPhase3Finalize(state, setState, startTransition);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phase 전이 시점에만 발화. setState 안정.
  }, [state.phase]);

  /* ─── OTP 재전송 쿨다운 카운트다운 ─────────────────────────
   * sendOtp 성공 시 retryAfterSeconds 가 채워짐. 1초마다 감소, 0 도달 시
   * 재전송 활성. Q9 위젯이 이 값을 prop 으로 받아 버튼 라벨에 표시.
   */
  useEffect(() => {
    if (state.otpCooldownSeconds <= 0) return;
    const t = setInterval(() => {
      setState((s) =>
        s.otpCooldownSeconds <= 1
          ? { ...s, otpCooldownSeconds: 0 }
          : { ...s, otpCooldownSeconds: s.otpCooldownSeconds - 1 },
      );
    }, 1000);
    return () => clearInterval(t);
  }, [state.otpCooldownSeconds]);

  return (
    // main 을 viewport (dynamic viewport height — 모바일 키보드 올라와도 정확)
    // 로 박아 flex 분배의 기준점 확보. parent 의 flex-1 chain 만 의존하면
    // dev banner / 페이지 scroll 등으로 main 이 viewport 보다 커져 슬롯이
    // sticky 처럼 viewport 에 떠 메시지 위를 가리는 케이스 발생. h-[100dvh]
    // 명시 후 슬롯은 normal flex item (shrink-0) 으로 두면 항상 메시지 영역
    // 아래에 위치 → 자동 스크롤이 정확히 메시지 끝을 슬롯 top 에 정렬.
    <main className="flex h-[100dvh] flex-col bg-white">
      <header className="px-6 pt-6 pb-3">
        <BrandMark />
      </header>

      {/*
       * 메시지 로그 스크롤 영역 — flex-1 로 슬롯 위 공간 전부 차지.
       * `min-h-0` 가 빠지면 flex 자식이 부모 height 를 무시하고 자기 콘텐츠로
       * 늘어나 overflow-y-auto 가 동작하지 않는다 (Tailwind/Flexbox 기본 동작).
       * overscroll-contain 으로 모바일에서 끝에 닿았을 때 부모 페이지 바운스
       * 차단. ref 는 useEffect 의 scrollTop 직접 설정에 사용 (위 주석 참조).
       */}
      <div
        ref={logContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4"
      >
        <div className="flex flex-col gap-2.5">
          {state.log.map((entry, i) => (
            <LogEntryView key={i} entry={entry} />
          ))}
          {/*
           * PROC1 / PROC2_SENDING_OTP / PROC3 동안 화면에 별도 시각 cue 없음 —
           * 사용자 답변 이후 잠시 정적 상태로 머물다 다음 봇 메시지/슬롯 위젯이
           * 등장. 챗봇이 "처리 중인 척" 하는 인디케이터 제거 (사용자 요청).
           * server action 자체는 보통 ~수백 ms 라 자연스러운 응답 텀.
           */}
        </div>
      </div>

      {/*
       * 입력 슬롯 — normal flex item (shrink-0). 메시지 영역(flex-1) 바로
       * 아래에 위치하므로 메시지 마지막이 슬롯에 가려질 일 없음. sticky 가
       * 아닌 이유: main 이 h-[100dvh] 로 정확히 viewport 를 차지하면 sticky
       * 효과가 필요 없고, 오히려 sticky 가 일부 브라우저/flex chain 에서
       * 의도와 다르게 떠 메시지 위를 침범하는 케이스가 있음.
       */}
      <div className="shrink-0 border-t border-[#efefef] bg-white px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <PromptSlot
          state={state}
          setState={setState}
          priceTiers={priceTiers}
        />
      </div>
    </main>
  );
}

/* ============================================================
 * ChatState — 단일 client 컴포넌트가 보유하는 대화 + 데이터 상태
 * ============================================================ */

export type Phase =
  | "Q1" /* coverage intent */
  | "Q1_5" /* focused concerns */
  | "Q2" /* budget */
  | "Q3" /* occupation */
  | "Q4" /* medical 유무 */
  | "Q4_5" /* medical entries */
  | "Q4_8" /* 외부 설계안 유무 */
  | "Q4_9" /* 외부 설계안 PDF 업로드 */
  | "Q5" /* notes 유무 */
  | "Q5_5" /* notes text */
  | "PROC1" /* submitStep1 + autoSelectAndAdvance */
  | "Q6" /* name */
  | "Q7" /* birthDate + gender */
  | "Q8" /* phone (sendOtp 트리거) */
  | "PROC2_SENDING_OTP" /* sendOtp in-flight */
  | "Q9" /* OTP code */
  | "Q10" /* consent (messaging) */
  | "PROC3" /* finalizeRequest */
  | "DONE" /* redirected to /dispatched */
  | "ERROR"; /* 회복 불가 에러 - 재시작 안내 */

export type LogEntry =
  | { role: "bot"; text: string }
  | { role: "user"; text: string };

export type ChatState = {
  phase: Phase;

  // Step1 데이터
  coverageIntent?: CoverageIntent;
  focusedConcerns: FocusedConcernId[];
  monthlyBudgetMin?: number;
  monthlyBudgetMax?: number;
  occupation?: string;
  medicalHistory: MedicalHistoryEntry[];
  /**
   * 외부 설계안 PDF 의 S3 키 배열 (Q4_8/Q4_9 에서 수집, 최대 5건).
   * submitStep1 시 폼 hidden 으로 전송 → server 가 검증 후 plan_request 에 저장.
   */
  externalProposalKeys: string[];
  additionalNotes?: string;

  // submitStep1 응답
  requestId?: string;

  // Step3 데이터 (finalize 직전 변환)
  name?: string;
  birthDate?: string; // YYYY-MM-DD
  gender?: Gender;
  phone?: string; // digits only
  otpCode?: string;
  otpCooldownSeconds: number;
  consentMessaging: boolean; // Q10 chip; consentThirdParty 는 항상 false 전송

  // UI / 에러
  log: LogEntry[];
  errorMessage?: string; // ERROR phase 일 때 봇 버블에 표시
};

function initialChatState(): ChatState {
  return {
    phase: "Q1",
    focusedConcerns: [],
    medicalHistory: [],
    externalProposalKeys: [],
    otpCooldownSeconds: 0,
    consentMessaging: false,
    log: [
      {
        role: "bot",
        text: "안녕하세요 👋\n몇 가지만 여쭤보고\n가장 잘 맞는 설계사를 찾아드릴게요.",
      },
      { role: "bot", text: "먼저, 어떤 보장을 알아보고 계세요?" },
    ],
  };
}

/* ============================================================
 * advance helpers — 외부에서 호출. setState 콜백 형태.
 * ============================================================
 *
 * 각 phase 의 사용자 응답 처리는 PromptSlot 위젯이 직접 setState 콜백을 받아
 * 다음 phase 로 전이. ChatbotShell 은 PROC* phase 진입 시 server action 만
 * 책임.
 */

/** 사용자 응답을 log 에 push + 다음 phase 로 전이. */
export function appendUserAnswer(
  prev: ChatState,
  userText: string,
  next: Partial<ChatState>,
): ChatState {
  return {
    ...prev,
    ...next,
    log: [...prev.log, { role: "user", text: userText }],
  };
}

/** 다음 봇 메시지를 log 에 push (배열로 받아 여러 줄). */
export function appendBotMessages(
  prev: ChatState,
  messages: string[],
): ChatState {
  return {
    ...prev,
    log: [...prev.log, ...messages.map((text) => ({ role: "bot" as const, text }))],
  };
}

/* ============================================================
 * Phase 1 백엔드 — submitStep1 + autoSelectAndAdvance
 * ============================================================
 *
 * 두 server action 을 직렬 호출. 둘 다 성공해야 다음 봇 메시지("거의 끝났어요...")
 * 가 나오고 Q6 로 전이. 한 쪽이라도 실패하면 ERROR phase + 재시작 안내.
 *
 * 시각 cue 없음 — 사용자 요청으로 SystemLoadingBubble / 인위적 최소 노출 시간
 * delay 모두 제거. server action 응답을 그대로 기다림.
 */
function runPhase1Submission(
  state: ChatState,
  setState: React.Dispatch<React.SetStateAction<ChatState>>,
  startTransition: React.TransitionStartFunction,
) {
  startTransition(async () => {
    const fd = new FormData();
    if (state.occupation) fd.append("occupation", state.occupation);
    if (state.monthlyBudgetMin !== undefined) {
      fd.append("monthlyBudgetMin", String(state.monthlyBudgetMin));
    }
    if (state.monthlyBudgetMax !== undefined) {
      fd.append("monthlyBudgetMax", String(state.monthlyBudgetMax));
    }
    fd.append("coverage", JSON.stringify(buildCoverage(state)));
    fd.append("medicalHistory", JSON.stringify(state.medicalHistory));
    // 외부 설계안 키 — append 여러 번으로 array 전송. submitStep1 의
    // formData.getAll("externalProposalKeys") 가 그대로 받음.
    for (const key of state.externalProposalKeys) {
      fd.append("externalProposalKeys", key);
    }
    if (state.additionalNotes) {
      fd.append("additionalNotes", state.additionalNotes);
    }

    const step1Result = await submitStep1(undefined, fd);
    if (!step1Result || !("ok" in step1Result) || !step1Result.ok) {
      const msg =
        (step1Result &&
          "errors" in step1Result &&
          step1Result.errors?._form?.[0]) ||
        "잠시 후 다시 시도해 주세요.";
      setState((s) => ({
        ...s,
        phase: "ERROR",
        errorMessage: msg,
      }));
      return;
    }

    const requestId = step1Result.requestId;
    const autoResult = await autoSelectAndAdvance(requestId);
    if (!autoResult.ok) {
      setState((s) => ({
        ...s,
        phase: "ERROR",
        errorMessage: "설계사 배정에 실패했어요. 잠시 후 다시 시도해 주세요.",
        requestId,
      }));
      return;
    }

    setState((s) => ({
      ...s,
      requestId,
      phase: "Q6",
      log: [
        ...s.log,
        {
          role: "bot",
          text: "거의 끝났어요!\n마지막으로 본인 확인이 필요한데요,\n성함을 알려주실 수 있을까요?",
        },
      ],
    }));
  });
}

/* ============================================================
 * Phase 3 백엔드 — finalizeRequest
 * ============================================================
 *
 * Step3 변환: birthDate + gender → rrnFront(YYMMDD) + rrnBack1(1~4)
 *   - 1900s 남 = "1", 여 = "2"; 2000s 남 = "3", 여 = "4"
 *   - 1900~2099 만 허용 (Q7 위젯이 date input 의 min/max 로 제한)
 *
 * consent: consentThirdParty="off" (챗봇은 받지 않음) / consentMessaging="on"
 * (Q10 chip 선택 시에만 도달).
 *
 * **navigation**: finalizeRequest 가 server action 안에서
 * `redirect("/plan-request/{id}/dispatched")` 를 throw → Next.js 가 client
 * navigation 자동 트리거. 따라서 여기서는 router 객체를 받지 않고 server action
 * 의 redirect 에 위임.
 */
function runPhase3Finalize(
  state: ChatState,
  setState: React.Dispatch<React.SetStateAction<ChatState>>,
  startTransition: React.TransitionStartFunction,
) {
  if (!state.requestId) {
    setState((s) => ({ ...s, phase: "ERROR", errorMessage: "요청 ID 가 없어요." }));
    return;
  }

  const rrn = deriveRrnFields(state);
  if (!rrn) {
    setState((s) => ({
      ...s,
      phase: "Q7",
      log: [
        ...s.log,
        {
          role: "bot",
          text: "생년월일을 다시 확인해주세요.\n1900년 이후 날짜만 가능해요.",
        },
      ],
    }));
    return;
  }

  startTransition(async () => {
    const fd = new FormData();
    fd.append("name", state.name ?? "");
    fd.append("rrnFront", rrn.rrnFront);
    fd.append("rrnBack1", rrn.rrnBack1);
    fd.append("phone", state.phone ?? "");
    fd.append("code", state.otpCode ?? "");
    fd.append("consentThirdParty", "off");
    fd.append("consentMessaging", "on");

    const result = await finalizeRequest(state.requestId!, undefined, fd);

    // finalizeRequest 성공 시 redirect throw → 여기 도달 안 함. result 가 있으면 실패.
    if (!result) {
      setState((s) => ({ ...s, phase: "DONE" }));
      return;
    }

    // OTP 만료 / 불일치 → Q9 로 복귀
    if (result.errors?.code) {
      setState((s) => ({
        ...s,
        phase: "Q9",
        otpCode: "",
        log: [
          ...s.log,
          {
            role: "bot",
            text:
              result.errors!.code![0] === "인증번호가 만료되었습니다. 재전송해주세요."
                ? "인증번호가 만료됐어요.\n아래에서 다시 받아주세요."
                : "인증번호가 다른 것 같아요.\n다시 확인해주세요.",
          },
        ],
      }));
      return;
    }

    // RRN/생년월일 검증 실패 → Q7 로
    if (result.errors?.rrnFront || result.errors?.rrnBack1) {
      setState((s) => ({
        ...s,
        phase: "Q7",
        log: [
          ...s.log,
          {
            role: "bot",
            text: "생년월일과 성별을\n다시 확인해주세요.",
          },
        ],
      }));
      return;
    }

    // 이름 / phone 검증 실패 → 해당 phase 로
    if (result.errors?.name) {
      setState((s) => ({
        ...s,
        phase: "Q6",
        log: [...s.log, { role: "bot", text: "성함을 다시 알려주세요." }],
      }));
      return;
    }
    if (result.errors?.phone) {
      setState((s) => ({
        ...s,
        phase: "Q8",
        log: [
          ...s.log,
          { role: "bot", text: "휴대폰 번호를\n다시 확인해주세요." },
        ],
      }));
      return;
    }

    // 기타 _form 에러
    setState((s) => ({
      ...s,
      phase: "ERROR",
      errorMessage:
        result.errors?._form?.[0] ??
        "확인에 실패했어요.\n잠시 후 다시 시도해주세요.",
    }));
  });
}

/* ============================================================
 * sendOtp — Q8 → Q9 전환 시 위젯에서 호출하는 helper.
 * ============================================================
 *
 * Q8 위젯의 "확인" 버튼이 setState 로 phase="PROC2_SENDING_OTP" 로 옮긴 뒤
 * 이 helper 를 호출. 성공 시 Q9 + cooldown, 실패 시 봇 메시지 + Q8 복귀.
 *
 * 호출 형태: `triggerSendOtp(state, setState, startTransition)` — 위젯에서
 * useTransition 한 번 받아 넘김.
 */
export async function triggerSendOtp(
  requestId: string,
  phone: string,
): Promise<
  | { ok: true; retryAfterSeconds: number }
  | { ok: false; message: string; retryAfterSeconds?: number }
> {
  const fd = new FormData();
  fd.append("phone", phone);
  const result = await sendOtp(requestId, undefined, fd);
  if (result?.ok) {
    return { ok: true, retryAfterSeconds: result.retryAfterSeconds };
  }
  const message =
    result?.errors?._form?.[0] ??
    result?.errors?.phone?.[0] ??
    "전송에 실패했어요. 잠시 후 다시 시도해주세요.";
  return {
    ok: false,
    message,
    retryAfterSeconds: result?.retryAfterSeconds,
  };
}

/* ============================================================
 * 내부 helpers
 * ============================================================ */

function LogEntryView({ entry }: { entry: LogEntry }) {
  if (entry.role === "bot") return <BotBubble>{entry.text}</BotBubble>;
  return <UserBubble>{entry.text}</UserBubble>;
}

function buildCoverage(state: ChatState):
  | { intent: "broad" }
  | { intent: "focused"; concerns: FocusedConcernId[] } {
  if (state.coverageIntent === "focused") {
    return { intent: "focused", concerns: state.focusedConcerns };
  }
  return { intent: "broad" };
}

function deriveRrnFields(
  state: ChatState,
): { rrnFront: string; rrnBack1: string } | null {
  if (!state.birthDate || !state.gender) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.birthDate);
  if (!m) return null;
  const year = Number(m[1]);
  const mm = m[2];
  const dd = m[3];
  if (year < 1900 || year > 2099) return null;
  const yy = String(year % 100).padStart(2, "0");
  const back1 =
    year < 2000
      ? state.gender === "male"
        ? "1"
        : "2"
      : state.gender === "male"
        ? "3"
        : "4";
  return { rrnFront: `${yy}${mm}${dd}`, rrnBack1: back1 };
}

