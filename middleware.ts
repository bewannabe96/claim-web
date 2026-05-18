import { createServerClient } from "@supabase/ssr";
import { isAuthError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * /admin/* + /partner/* middleware.
 *
 * 파일명/함수명 메모: Next 16 공식 후속 컨벤션은 `proxy.ts` + `export function proxy`
 * 지만, 16.2.4 에서 proxy.ts 가 build manifest 에 등록되지 않는 버그 존재.
 * legacy `middleware.ts` + `export async function middleware` 는 정상 작동.
 * 버그 수정 시 `npx @next/codemod@canary middleware-to-proxy` 로 일괄 변환.
 *
 * Admin 영역의 다섯 가지 역할:
 *
 * 1. **Knock 게이트 (Cookie-based obscurity)** — `ADMIN_KNOCK_PATH` env 가
 *    설정된 경우, `/<knock>` URL 진입 시 `admin_knock` 쿠키 (30일) 발급 후
 *    `/admin/login` 으로 307. `/admin/*` 요청은 유효한 knock 쿠키가 있을 때만
 *    통과시키고 그 외엔 **404** 로 응답 — admin 존재 자체를 부정.
 *    봇 스캐너의 `/admin`, `/wp-admin` 류 probe 차단이 주 목적. **보안이 아닌
 *    obscurity** — 코드 유출 시 무력화되므로 MFA / IP 화이트리스트 등과 병행.
 *    env 미설정 시 knock 검사 스킵 (dev 편의).
 *
 * 2. **Optimistic 비인증 차단** — Supabase 세션 cookie 자체가 없으면 즉시 307
 *    로그인 페이지로 리다이렉트. 이게 없으면 cacheComponents/PPR 모드에서
 *    layout 의 `redirect()` 가 HTTP 307 이 아니라 1초 `<meta http-equiv=refresh>`
 *    fallback 으로 처리되어, 그 1초 동안 셸이 응답 body 에 노출되고 크롤러는
 *    HTTP 200 으로 인식해 색인할 수 있음.
 *
 *    docs/architecture.md §7.2 — middleware 는 optimistic redirect 용. 실제 권한
 *    검사 (admin_users / partner 화이트리스트) 는 layout 의 `requireAdminSession()` /
 *    `requirePartnerSession()` 가 single source of truth.
 *
 * 3. **Supabase 세션 cookie silent refresh + stale cleanup** — 토큰 만료
 *    임박 시 @supabase/ssr 의 setAll 콜백으로 Set-Cookie 자동 갱신. getUser()
 *    호출이 부수 효과로 갱신 트리거. refresh 실패 (refresh_token_not_found 등
 *    AuthError) 면 stale `sb-*-auth-token*` cookie 를 명시 청소 — 라이브러리는
 *    AuthSessionMissingError 에서만 자동 청소하므로 refresh 실패 경로는 수동.
 *
 * 4. **크롤러 차단 (admin 만)** — X-Robots-Tag 헤더로 search engine indexing 금지.
 *    `/admin/login` 까지 포함 모든 admin 응답 + knock 응답 + 404 응답 모두 적용.
 *    metadata.robots (src/app/admin/layout.tsx) 와 이중 방어. Partner 영역은
 *    가입자/마케팅과 동등 노출 정책이므로 X-Robots-Tag 적용 안 함.
 *
 * Partner 영역의 carve-out:
 *
 * - `/partner/login` — 비인증 진입이 정상.
 * - `/partner/assignments/*` — 알림톡 일회용 토큰 진입 (PRD §5.4). 토큰 자체가
 *   인증이므로 Supabase 세션 없어도 통과. `done` 페이지도 토큰 흐름 후속이라
 *   동일 carve-out.
 *
 * 그 외 `/partner/*` (예: `/partner` 대시보드) 는 admin 과 동일한 optimistic 차단.
 */

const KNOCK_PATH = process.env.ADMIN_KNOCK_PATH;
const KNOCK_COOKIE = "admin_knock";
const KNOCK_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30일

const ROBOTS_HEADER =
  "noindex, nofollow, noarchive, nosnippet, noimageindex";

function withRobots<T extends NextResponse>(res: T): T {
  res.headers.set("X-Robots-Tag", ROBOTS_HEADER);
  return res;
}

function isPartnerPublicPath(pathname: string): boolean {
  // 토큰 진입 + 로그인 + 신규 가입은 비인증 통과. done 도 토큰 흐름 후속이므로 carve-out.
  // signup 은 어드민이 발급한 초청 token 으로 진입 — token 자체가 1차 인증.
  return (
    pathname === "/partner/login" ||
    pathname.startsWith("/partner/assignments/") ||
    pathname === "/partner/assignments" ||
    pathname.startsWith("/partner/signup/")
  );
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPartnerPath =
    pathname === "/partner" || pathname.startsWith("/partner/");
  const isKnockPath = !!KNOCK_PATH && pathname === `/${KNOCK_PATH}`;

  // 어느 분기에도 안 걸리면 no-op — 마케팅/가입자 페이지 영향 X.
  if (!isAdminPath && !isPartnerPath && !isKnockPath) {
    return NextResponse.next({ request: req });
  }

  // ① Knock URL — 쿠키 발급 후 /admin/login 으로 redirect.
  if (isKnockPath) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    const res = withRobots(NextResponse.redirect(url, 307));
    res.cookies.set(KNOCK_COOKIE, KNOCK_PATH, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: KNOCK_MAX_AGE_SECONDS,
      path: "/admin",
    });
    return res;
  }

  // ② /admin/* 게이트 — knock 환경변수 설정 시 유효한 쿠키 없으면 404.
  if (isAdminPath && KNOCK_PATH) {
    const knock = req.cookies.get(KNOCK_COOKIE)?.value;
    if (knock !== KNOCK_PATH) {
      return withRobots(new NextResponse(null, { status: 404 }));
    }
  }

  // ③ Partner 공개 경로 (token / login) 는 auth 체크 없이 통과.
  if (isPartnerPath && isPartnerPublicPath(pathname)) {
    return NextResponse.next({ request: req });
  }

  // Admin 응답에만 X-Robots-Tag. Partner 는 가입자와 동등 노출 정책.
  const res = isAdminPath
    ? withRobots(NextResponse.next({ request: req }))
    : NextResponse.next({ request: req });

  const loginPath = isAdminPath ? "/admin/login" : "/partner/login";
  const isLoginPath = pathname === loginPath;

  let hasUser = false;
  try {
    const supabase = createServerClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (toSet) => {
            for (const { name, value, options } of toSet) {
              res.cookies.set(name, value, options);
            }
          },
        },
      },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    hasUser = !!user;
  } catch (e) {
    // 무한 redirect 회피용 hasUser=false fallthrough. 실제 게이트는 layout DAL.
    //
    // AuthError (refresh_token_not_found 등) 면 stale auth cookie 명시 청소 —
    // @supabase/auth-js 는 AuthSessionMissingError 에서만 자동 _removeSession 하므로
    // refresh 실패는 cookie 가 남아 매 요청 반복 + login 페이지 DAL 도 throw 됨.
    // 307 응답의 Set-Cookie 는 브라우저가 redirect 따라가기 전에 적용. env / 네트워크
    // 오류엔 cookie 안 건드림 (일시 장애로 세션 날리지 않기 위함).
    if (isAuthError(e)) {
      for (const c of req.cookies.getAll()) {
        if (/^sb-.+-auth-token(\.\d+)?$/.test(c.name)) {
          res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
        }
      }
    }
  }

  // ④ 비인증 → 307 (PPR 모드에서 layout redirect 가 meta refresh fallback 되는 것 차단)
  if (!isLoginPath && !hasUser) {
    const url = req.nextUrl.clone();
    url.pathname = loginPath;
    url.search = "";
    const baseRes = isAdminPath
      ? withRobots(NextResponse.redirect(url, 307))
      : NextResponse.redirect(url, 307);
    for (const c of res.cookies.getAll()) {
      baseRes.cookies.set(c);
    }
    return baseRes;
  }

  return res;
}

// matcher 는 static-parsable 만 허용 (ENV 기반 conditional 불가). 모든 non-asset
// 경로 매치 + middleware 함수 안에서 admin/partner/knock 만 필터. 마케팅 경로는
// 첫 분기에서 NextResponse.next() 로 즉시 통과 — 오버헤드 ~1ms.
export const config = {
  matcher: ["/((?!_next/|api/|favicon\\.ico|.*\\..*).*)"],
};
