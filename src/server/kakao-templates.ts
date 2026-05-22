import "server-only";

/**
 * 알림톡 템플릿 카탈로그 — 도메인 데이터 → 검수본 `#{변수}` 맵 변환.
 *
 * 검수본 본문/버튼은 더 이상 이 파일이 미러링하지 않는다. 알리고 콘솔의 검수본이
 * 단일 진실 공급원이고, `sendAlimtalk` 가 `template/list` 로 런타임에 가져와
 * `#{변수}` 만 치환한다. 이 파일은 (1) 템플릿 코드 상수와 (2) 도메인 값 → `#{변수}`
 * 키 맵 빌더만 책임 — 빌더가 typed 라 호출부가 변수를 누락하면 컴파일 에러로 잡힌다.
 *
 * 각 빌더의 `variables` 키는 알리고 콘솔 검수본의 `#{...}` placeholder 이름과
 * 정확히 일치해야 한다 (snake_case). 검수본의 placeholder 가 바뀌면 이 파일도 갱신.
 * 버튼 링크 URL 의 호스트(`https://www.claim.ac/...`)는 검수본에 박혀 있으므로
 * 빌더는 토큰 등 path 변수만 넘긴다 (origin 불필요).
 */

/** 빌더 반환 형태 — `sendAlimtalk(receiver, templateCode, variables)` 인자. */
export interface AlimtalkDispatch {
  templateCode: string;
  variables: Record<string, string>;
}

/* ============================================================
 * UI_0735 — 파트너 선택 알림
 * 수신자: 가입자가 선택한 설계사
 * 트리거: finalizeRequest 가 status='dispatched' 로 전환한 직후
 * 검수본 변수: #{partner_name} #{customer_name} #{budget} #{request_text}
 *             #{token} (버튼 URL)
 * ============================================================ */

export const KAKAO_TEMPLATE_NEW_ASSIGNMENT = "UI_0735" as const;

export function buildNewAssignmentAlimtalk(vars: {
  partnerName: string;
  customerName: string;
  /** 미리 포맷된 보험료 표기 (예: "월 10만~20만"). */
  budget: string;
  /** 미리 포맷된 필요 담보 텍스트. */
  requestText: string;
  /** 파트너용 일회용 진입 토큰 (plan_request_assignment.token) — 버튼 URL 의 #{token}. */
  token: string;
}): AlimtalkDispatch {
  return {
    templateCode: KAKAO_TEMPLATE_NEW_ASSIGNMENT,
    variables: {
      partner_name: vars.partnerName,
      customer_name: vars.customerName,
      budget: vars.budget,
      request_text: vars.requestText,
      token: vars.token,
    },
  };
}

/* ============================================================
 * UI_0738 — 전화/문자 요청 알림
 * 수신자: 제안서를 작성한 설계사
 * 트리거: 결과 페이지에서 가입자가 연락 요청 (requestPlanProposalContact)
 * 검수본 변수: #{partner_name} #{customer_name} #{customer_phone_no}
 *             #{contact_method}
 * ============================================================ */

export const KAKAO_TEMPLATE_CONTACT_REQUEST = "UI_0738" as const;

export function buildContactRequestAlimtalk(vars: {
  partnerName: string;
  customerName: string;
  customerPhoneNo: string;
  /** 가입자가 선택한 상담 수단 한글 라벨 (예: "문자", "전화"). */
  contactMethod: string;
}): AlimtalkDispatch {
  return {
    templateCode: KAKAO_TEMPLATE_CONTACT_REQUEST,
    variables: {
      partner_name: vars.partnerName,
      customer_name: vars.customerName,
      customer_phone_no: vars.customerPhoneNo,
      contact_method: vars.contactMethod,
    },
  };
}

/* ============================================================
 * UI_0741 — AI 제안서 분석 완료 알림
 * 수신자: 가입자
 * 트리거: 어드민 요청 상세 '완료 알림톡 발송' 버튼 (분석 완료 자동 발송은 현재 비활성화)
 * 검수본 변수: #{customer_name}  #{token} (버튼 URL)
 * ============================================================ */

export const KAKAO_TEMPLATE_ANALYSIS_COMPLETED = "UI_0741" as const;

export function buildAnalysisCompletedAlimtalk(vars: {
  customerName: string;
  /** 가입자 결과 페이지 진입 토큰 (plan_request.resultToken) — 버튼 URL 의 #{token}. */
  token: string;
}): AlimtalkDispatch {
  return {
    templateCode: KAKAO_TEMPLATE_ANALYSIS_COMPLETED,
    variables: {
      customer_name: vars.customerName,
      token: vars.token,
    },
  };
}
