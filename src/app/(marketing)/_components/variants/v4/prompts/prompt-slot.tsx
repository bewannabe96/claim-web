"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { formatBudgetRange } from "@/features/plan-request-pricing/format";
import type { PriceTier } from "@/features/plan-request-pricing/schema";
import {
  FOCUSED_CONCERN_IDS,
  FOCUSED_CONCERN_LABEL,
  type FocusedConcernId,
} from "@/features/plan-requests/schema";
import type { Gender } from "@/types";

import {
  appendUserAnswer,
  appendBotMessages,
  triggerSendOtp,
  type ChatState,
} from "../chatbot-shell";

import { BirthdateGenderInput } from "./birthdate-gender-input";
import { ChipMulti } from "./chip-multi";
import { ChipSingle } from "./chip-single";
import { ChoiceCards } from "./choice-cards";
import { ConsentSingle } from "./consent-single";
import { FileUpload } from "./file-upload";
import { MedicalCardPrompt } from "./medical-card";
import { OtpInput, PhoneInput } from "./phone-otp-input";
import { TextInput } from "./text-input";
import { TextareaInput } from "./textarea-input";

/**
 * PromptSlot — 현재 phase 에 맞는 입력 위젯을 dispatch + 사용자 응답을 받아
 * chatbot-shell 의 ChatState 를 다음 phase 로 전이.
 *
 * 모든 phase 전이 로직 (어떤 봇 메시지를 push 하고 어떤 phase 로 가는지) 가
 * 이 한 파일에 집중 — 위젯 자체는 dumb prop-only 컴포넌트로 유지. PROC*
 * phase 는 chatbot-shell 이 자체 effect 로 server action 호출하므로 slot 은
 * 빈 자리 (또는 ERROR 일 때 재시도 버튼).
 */
export function PromptSlot({
  state,
  setState,
  priceTiers,
}: {
  state: ChatState;
  setState: React.Dispatch<React.SetStateAction<ChatState>>;
  priceTiers: PriceTier[];
}) {
  const [otpPending, startOtpTransition] = useTransition();

  switch (state.phase) {
    /* ─── Phase 1: 요청서 본문 ─────────────────────────────── */

    case "Q1":
      return (
        <ChoiceCards
          options={[
            {
              label: "종합적으로 알아보고 있어요",
              value: "broad",
              onSelect: () =>
                setState((s) =>
                  appendBotMessages(
                    appendUserAnswer(s, "종합적으로 알아보고 있어요", {
                      coverageIntent: "broad",
                      phase: "Q2",
                    }),
                    ["월 보험료는 어느 정도 생각하세요?"],
                  ),
                ),
            },
            {
              label: "대비하고 싶은 게 따로 있어요",
              value: "focused",
              onSelect: () =>
                setState((s) =>
                  appendBotMessages(
                    appendUserAnswer(s, "대비하고 싶은 게 따로 있어요", {
                      coverageIntent: "focused",
                      phase: "Q1_5",
                    }),
                    ["어떤 걸 대비하고 싶으세요?\n여러 개 선택할 수 있어요"],
                  ),
                ),
            },
          ]}
        />
      );

    case "Q1_5":
      return (
        <ChipMulti<FocusedConcernId>
          options={FOCUSED_CONCERN_IDS.map((id) => ({
            label: FOCUSED_CONCERN_LABEL[id],
            value: id,
          }))}
          onConfirm={(values) => {
            const labels = values.map((v) => FOCUSED_CONCERN_LABEL[v]).join(", ");
            setState((s) =>
              appendBotMessages(
                appendUserAnswer(s, labels, {
                  focusedConcerns: values,
                  phase: "Q2",
                }),
                ["월 보험료는 어느 정도 생각하세요?"],
              ),
            );
          }}
        />
      );

    case "Q2":
      return (
        <ChipSingle
          options={priceTiers.map((t) => ({
            label: formatBudgetRange(t.budgetMin, t.budgetMax),
            value: t.id,
            onSelect: () => {
              const label = formatBudgetRange(t.budgetMin, t.budgetMax);
              setState((s) =>
                appendBotMessages(
                  appendUserAnswer(s, label, {
                    monthlyBudgetMin: t.budgetMin,
                    monthlyBudgetMax: t.budgetMax,
                    phase: "Q3",
                  }),
                  ["직업이 어떻게 되세요?"],
                ),
              );
            },
          }))}
        />
      );

    case "Q3":
      return (
        <TextInput
          placeholder="예: 반도체연구원, 학원선생님"
          maxLength={50}
          onSubmit={(value) =>
            setState((s) =>
              appendBotMessages(
                appendUserAnswer(s, value, {
                  occupation: value,
                  phase: "Q4",
                }),
                ["치료받았거나 진단받은 이력이 있으세요?"],
              ),
            )
          }
        />
      );

    case "Q4":
      return (
        <ChoiceCards
          options={[
            {
              label: "없어요",
              value: "no",
              onSelect: () =>
                setState((s) =>
                  appendBotMessages(
                    appendUserAnswer(s, "없어요", {
                      medicalHistory: [],
                      phase: "Q4_8",
                    }),
                    ["혹시 다른 곳에서 받아온 가입 설계안이 있으세요?"],
                  ),
                ),
            },
            {
              label: "있어요",
              value: "yes",
              onSelect: () =>
                setState((s) =>
                  appendBotMessages(
                    appendUserAnswer(s, "있어요", { phase: "Q4_5" }),
                    [
                      "병력을 알려주세요.\n여러 건이면 추가해서 적으실 수 있어요.",
                    ],
                  ),
                ),
            },
          ]}
        />
      );

    case "Q4_5":
      return (
        <MedicalCardPrompt
          onConfirm={(entries) =>
            setState((s) =>
              appendBotMessages(
                appendUserAnswer(s, `병력 ${entries.length}건 알려드렸어요`, {
                  medicalHistory: entries,
                  phase: "Q4_8",
                }),
                ["혹시 다른 곳에서 받아온 가입 설계안이 있으세요?"],
              ),
            )
          }
        />
      );

    case "Q4_8":
      return (
        <ChoiceCards
          options={[
            {
              label: "없어요",
              value: "no",
              onSelect: () =>
                setState((s) =>
                  appendBotMessages(
                    appendUserAnswer(s, "없어요", {
                      externalProposalKeys: [],
                      phase: "Q5",
                    }),
                    ["마지막으로 더 알려주실 내용이 있나요?"],
                  ),
                ),
            },
            {
              label: "있어요",
              value: "yes",
              onSelect: () =>
                setState((s) =>
                  appendBotMessages(
                    appendUserAnswer(s, "있어요", { phase: "Q4_9" }),
                    [
                      "받아온 설계안을\nPDF나 사진으로 첨부해주세요.\n비교 분석에 활용해 드릴게요.\n(최대 5건)",
                    ],
                  ),
                ),
            },
          ]}
        />
      );

    case "Q4_9":
      return (
        <FileUpload
          initialKeys={state.externalProposalKeys}
          maxCount={5}
          onConfirm={(keys) =>
            setState((s) =>
              appendBotMessages(
                appendUserAnswer(s, `설계안 ${keys.length}건 첨부했어요`, {
                  externalProposalKeys: keys,
                  phase: "Q5",
                }),
                ["마지막으로 더 알려주실 내용이 있나요?"],
              ),
            )
          }
        />
      );

    case "Q5":
      return (
        <ChoiceCards
          options={[
            {
              label: "없어요, 바로 진행할게요",
              value: "no",
              onSelect: () =>
                setState((s) =>
                  appendUserAnswer(s, "없어요, 바로 진행할게요", {
                    additionalNotes: undefined,
                    phase: "PROC1",
                  }),
                ),
            },
            {
              label: "있어요",
              value: "yes",
              onSelect: () =>
                setState((s) =>
                  appendBotMessages(
                    appendUserAnswer(s, "있어요", { phase: "Q5_5" }),
                    ["어떤 부분이 신경 쓰이세요?\n자유롭게 적어주세요"],
                  ),
                ),
            },
          ]}
        />
      );

    case "Q5_5":
      return (
        <TextareaInput
          placeholder={`예: 당뇨가 있어서 당뇨로 생길 수 있는 병을 잘 대비하고 싶어요`}
          onSubmit={(value) =>
            setState((s) =>
              appendUserAnswer(s, value, {
                additionalNotes: value,
                phase: "PROC1",
              }),
            )
          }
        />
      );

    /* ─── Phase 2 (PROC1): chatbot-shell 이 자동 실행. 슬롯은 비움. ──── */
    case "PROC1":
      return null;

    /* ─── Phase 3: 본인인증 ────────────────────────────────── */

    case "Q6":
      return (
        <TextInput
          placeholder="홍길동"
          maxLength={20}
          autoComplete="name"
          onSubmit={(value) =>
            setState((s) =>
              appendBotMessages(
                appendUserAnswer(s, value, { name: value, phase: "Q7" }),
                [
                  "생년월일 6자리(예: 980504)와\n성별을 알려주세요.\n저장하지 않고 본인 확인용으로만 써요.",
                ],
              ),
            )
          }
        />
      );

    case "Q7":
      return (
        <BirthdateGenderInput
          onSubmit={(birthDate, gender) => {
            // user bubble 은 사용자가 입력한 그대로(YYMMDD 6자리) 보여줘 입력
            // 인지와 시각적으로 정합. birthDate 자체는 YYYY-MM-DD 로 저장.
            const sixDigit = birthDate.replace(/-/g, "").slice(2);
            const label = `${sixDigit} · ${genderLabel(gender)}`;
            setState((s) =>
              appendBotMessages(
                appendUserAnswer(s, label, {
                  birthDate,
                  gender,
                  phase: "Q8",
                }),
                ["연락받으실\n휴대폰 번호를 알려주세요"],
              ),
            );
          }}
        />
      );

    case "Q8":
      return (
        <PhoneInput
          disabled={otpPending}
          onSubmit={(phone) => {
            // PROC2_SENDING_OTP 로 옮긴 뒤 sendOtp 호출.
            setState((s) =>
              appendUserAnswer(s, formatPhoneForLog(phone), {
                phone,
                phase: "PROC2_SENDING_OTP",
              }),
            );
            startOtpTransition(async () => {
              const requestId = state.requestId!;
              const result = await triggerSendOtp(requestId, phone);
              if (result.ok) {
                setState((s) => ({
                  ...s,
                  phase: "Q9",
                  otpCooldownSeconds: result.retryAfterSeconds,
                  log: [
                    ...s.log,
                    {
                      role: "bot",
                      text: "고객님 번호로\n인증번호 6자리를 발송드렸어요.\n한 번 확인해주세요 📩",
                    },
                  ],
                }));
              } else {
                setState((s) => ({
                  ...s,
                  phase: "Q8",
                  otpCooldownSeconds: result.retryAfterSeconds ?? 0,
                  log: [...s.log, { role: "bot", text: result.message }],
                }));
              }
            });
          }}
        />
      );

    case "PROC2_SENDING_OTP":
      return null;

    case "Q9":
      return (
        <OtpInput
          cooldownSeconds={state.otpCooldownSeconds}
          onSubmit={(code) =>
            setState((s) =>
              appendBotMessages(
                appendUserAnswer(s, "●●●●●●", {
                  otpCode: code,
                  phase: "Q10",
                }),
                [
                  "저희가 AI 분석 결과를\n카카오톡 알림으로 보내드려요.\n괜찮으신가요?",
                ],
              ),
            )
          }
          onResend={() => {
            if (!state.phone || !state.requestId) return;
            startOtpTransition(async () => {
              const result = await triggerSendOtp(state.requestId!, state.phone!);
              if (result.ok) {
                setState((s) => ({
                  ...s,
                  otpCooldownSeconds: result.retryAfterSeconds,
                  log: [
                    ...s.log,
                    { role: "bot", text: "인증번호를\n다시 보내드렸어요 📩" },
                  ],
                }));
              } else {
                setState((s) => ({
                  ...s,
                  otpCooldownSeconds: result.retryAfterSeconds ?? 0,
                  log: [...s.log, { role: "bot", text: result.message }],
                }));
              }
            });
          }}
        />
      );

    case "Q10":
      return (
        <ConsentSingle
          onAgree={() =>
            setState((s) =>
              appendUserAnswer(s, "네, 좋아요", {
                consentMessaging: true,
                phase: "PROC3",
              }),
            )
          }
          onDecline={() =>
            setState((s) =>
              appendBotMessages(
                appendUserAnswer(s, "아직이요", {}),
                [
                  "결과를 알림으로 받지 않으면\n신청을 마칠 수 없어요.\n동의해주실 수 있을까요?",
                ],
              ),
            )
          }
        />
      );

    /* ─── PROC3 / DONE: chatbot-shell 이 처리. 슬롯 비움. ────────── */
    case "PROC3":
    case "DONE":
      return null;

    /* ─── ERROR: 재시작 안내 ────────────────────────────────── */
    case "ERROR":
      return (
        <div className="flex flex-col gap-2">
          <p className="px-2 text-xs text-red-600">
            {state.errorMessage ?? "예기치 못한 오류가 발생했어요."}
          </p>
          <Button
            type="button"
            onClick={() => window.location.reload()}
            className="h-14 w-full rounded-full text-sm font-medium"
          >
            처음부터 다시 시작하기
          </Button>
        </div>
      );

    default: {
      const _exhaustive: never = state.phase;
      void _exhaustive;
      return null;
    }
  }
}

function genderLabel(g: Gender): string {
  return g === "male" ? "남성" : "여성";
}

function formatPhoneForLog(digits: string): string {
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}
