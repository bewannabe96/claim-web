import "server-only";

import type { AlimtalkButton } from "./aligo";

/**
 * 알리고에 등록된 알림톡 템플릿 카탈로그.
 *
 * **본문 / 버튼 / 변수 자리는 알리고 콘솔의 검수본과 1바이트라도 다르면 발송 거부**되므로
 * 이 파일이 검수본의 단일 미러. 카카오 측 템플릿 변경 시 이 파일도 함께 갱신.
 * 원본 매핑은 [kakao-template.md](../../kakao-template.md).
 *
 * 각 빌더는 `{ subject, message, button?, failover? }` 형태의 알리고 페이로드 일부를
 * 반환. 호출자는 `sendAlimtalk(phone, { templateCode, ...builder(vars) })` 패턴.
 *
 * 버튼 링크는 prod 의 `https://www.claim.ac` 도메인을 가정해 검수 등록되어 있음 —
 * 다른 호스트(스테이징/dev preview)에서 실제 발송하면 거부됨. dev 는 ALIGO_TEST_MODE=Y
 * 로 dry-run, prod 는 PUBLIC_BASE_URL=https://www.claim.ac 으로 강제 (env 단의 사람 책임).
 */

/* ============================================================
 * UI_0735 — 파트너 선택 알림
 * 수신자: 가입자가 선택한 설계사
 * 트리거: finalizeRequest 가 status='dispatched' 로 전환한 직후
 * ============================================================ */

export const KAKAO_TEMPLATE_NEW_ASSIGNMENT = "UI_0735" as const;

export function buildNewAssignmentAlimtalk(vars: {
  partnerName: string;
  customerName: string;
  /** 미리 포맷된 보험료 표기 (예: "월 10만~20만"). */
  budget: string;
  /** 미리 포맷된 필요 담보 텍스트. */
  requestText: string;
  /** 파트너용 일회용 진입 토큰 (plan_request_assignment.token). */
  token: string;
  /** prod 도메인 base URL (`getPublicBaseUrl()` 결과). */
  origin: string;
}): {
  subject: string;
  message: string;
  button: AlimtalkButton[];
} {
  const url = `${vars.origin}/partner/plan-request-assignments/${vars.token}`;
  return {
    subject: "[Claim] 새 요청서 도착",
    message: [
      `[Claim] ${vars.partnerName} 파트너님,`,
      `${vars.customerName}님이 파트너님을 선택해서 요청서를 보내셨어요:)`,
      ``,
      `*희망보험료 : ${vars.budget}`,
      `*필요 담보 : ${vars.requestText}`,
      ``,
      `고객님의 요청을 수락하시면 진설계에 필요한 정보를 전달드려요.`,
      `지금 바로 요청서를 확인하시고 설계제안서를 보내보세요!`,
      ``,
      `(해당 메시지는 파트너님께서 '요청서 도착 알림'을 설정하신 경우 발송됩니다.)`,
    ].join("\n"),
    button: [
      {
        name: "요청서 확인하기",
        linkType: "WL",
        linkMo: url,
        linkPc: url,
      },
    ],
  };
}

/* ============================================================
 * UI_0738 — 전화/문자 요청 알림
 * 수신자: 제안서를 작성한 설계사
 * 트리거: 결과 페이지에서 가입자가 "문자 보내기" 클릭 (requestPlanProposalContact)
 *
 * 현재 결과 페이지 UI 는 "문자 보내기" 단일 액션 — contact_method 는 "문자" 고정.
 * 전화 옵션이 추가되면 contact_method 를 호출자에서 분기 전달.
 * ============================================================ */

export const KAKAO_TEMPLATE_CONTACT_REQUEST = "UI_0738" as const;

export function buildContactRequestAlimtalk(vars: {
  partnerName: string;
  customerName: string;
  customerPhoneNo: string;
  /** "문자" 또는 "전화". 현재 결과 페이지는 "문자" 고정. */
  contactMethod: string;
}): {
  subject: string;
  message: string;
} {
  return {
    subject: "[Claim] 연락 요청 도착",
    message: [
      `[Claim] ${vars.partnerName} 파트너님,`,
      `${vars.customerName}님이 파트너님의 설계제안서를 보시고, 연락을 요청하셨어요:)`,
      ``,
      `원활한 상담을 위하여 ${vars.customerName}님께서 요청하신 방법으로 지금 연락해보세요!`,
      ``,
      `*전화번호 : ${vars.customerPhoneNo}`,
      `*연락 요청 방법 : ${vars.contactMethod}`,
      ``,
      `(해당 메시지는 파트너님께서 '연락 요청 알림'을 설정하신 경우 발송됩니다.)`,
    ].join("\n"),
  };
}

/* ============================================================
 * UI_0741 — AI 제안서 분석 완료 알림
 * 수신자: 가입자
 * 트리거: 마지막 제안서 분석 콜백 후 finalizeRequestStatus 가 'completed' 전이
 * ============================================================ */

export const KAKAO_TEMPLATE_ANALYSIS_COMPLETED = "UI_0741" as const;

export function buildAnalysisCompletedAlimtalk(vars: {
  customerName: string;
  /** 가입자 결과 페이지 진입 토큰 (plan_request.resultToken). */
  token: string;
  origin: string;
}): {
  subject: string;
  message: string;
  button: AlimtalkButton[];
} {
  const url = `${vars.origin}/plan-request/result/${vars.token}`;
  return {
    subject: "[Claim] AI 분석 완료",
    message: [
      `[Claim] ${vars.customerName}님께서 선택하신 파트너님들의 제안서를 Claim AI가 분석했어요 :)`,
      ``,
      `지금 바로 분석 결과를 확인해보시고 마음에 드는 파트너님께 연락을 요청해보세요!`,
    ].join("\n"),
    button: [
      {
        name: "분석 결과 확인하기",
        linkType: "WL",
        linkMo: url,
        linkPc: url,
      },
    ],
  };
}
