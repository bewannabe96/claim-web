-- 가입자 제안서 요청 도메인 — 관계형 정규화 스키마.
--
-- "plan_request" — 가입자가 N명 설계사로부터 맞춤 보험 제안서를 받기 위해
-- 등록하는 요청서. PRD §5 의 핵심 도메인.
--
-- 테이블 구성 (모두 plan_request_ prefix 로 도메인 격리):
--   1. plan_request                — 요청서 본체 (Step1 + Step3 sparse)
--   2. plan_request_medical_history — 병력 (1:N, FK + position 으로 입력 순서 보존)
--   3. plan_request_candidate      — 후보 / 선택 (M:N junction, selected boolean)
--
-- 책임 분리:
--   - DB 는 **구조 무결성** 만 책임 — PK / FK / NOT NULL / UNIQUE / RLS.
--   - **value/format/range 검증은 앱 레이어 (zod)** 가 단일 진실 공급원.
--   - UNIQUE 인덱스는 race-condition 방어 (앱 단독으론 시점 이슈 못 막음).
--
-- ID 정책: 모든 PK 는 `text not null` (DEFAULT 없음). **앱 사이드 nanoid(16)**
-- 으로 INSERT 전에 생성 — 부모/자식 동시 build, 타입 레벨에서 누락 강제.
-- (`src/lib/id.ts` 의 `newId()` 사용).
--
-- 보안: server-side service_role 만 access (RLS deny-by-default + 정책 0).
-- REST endpoint 는 살려둠 — 추후 client-side 가 필요해지면 정책만 추가.

-- ============================================================
-- 공용 트리거 함수: updated_at 자동 갱신
-- ============================================================

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- plan_request — 요청서 본체
-- ============================================================

create table public.plan_request (
  id text primary key,

  -- ===== Step1: 요청서 본체 =====
  gender text not null,
  occupation text not null,
  monthly_budget_min int not null,
  monthly_budget_max int not null,

  -- 보장 요청 — schema 의 CoverageRequest discriminated union 그대로 JSONB 저장.
  -- 구조: { intent: "broad" } | { intent: "focused", concerns: string[], other?: string }
  -- 값/형식 검증은 zod (앱 레이어) 단일 진실 공급원, DB 는 NOT NULL 만 보장.
  coverage jsonb not null,

  additional_notes text,

  -- ===== Step3: 본인 인증 (1:1 sparse — 인증 완료 시 채워짐) =====
  name text,
  phone text,
  consent_third_party boolean not null default false,
  consent_messaging boolean not null default false,

  -- ===== 워크플로우 =====
  status text not null default 'selecting',
  rematch_count int not null default 0,
  result_token text,

  -- ===== 시점 =====
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  deadline_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.plan_request is
  '가입자 제안서 요청서. Step1 + Step3 sparse columns. Server Action (service_role) 만 access.';

comment on column public.plan_request.coverage is
  'CoverageRequest discriminated union (broad | focused). zod CoverageRequestSchema 가 정합 검증.';

-- ----- 인덱스 -----

create index plan_request_status_created_at_idx
  on public.plan_request (status, created_at desc);

create unique index plan_request_result_token_unique
  on public.plan_request (result_token)
  where result_token is not null;

create unique index plan_request_phone_active_unique
  on public.plan_request (phone)
  where phone is not null
    and status in ('draft', 'selecting', 'confirming', 'dispatched', 'analyzing', 'rematching');

-- ----- 트리거 -----

create trigger plan_request_set_updated_at
  before update on public.plan_request
  for each row execute function public.tg_set_updated_at();

-- ============================================================
-- plan_request_medical_history — 병력 (1:N)
-- ============================================================

create table public.plan_request_medical_history (
  id text primary key,
  request_id text not null references public.plan_request(id) on delete cascade,

  diagnosis text not null,
  treatment_period text not null,
  treatment_start_date date not null,
  hospitalization_days int not null default 0,
  outpatient_visits int not null default 0,
  had_surgery boolean not null default false,

  position int not null,

  created_at timestamptz not null default now(),

  constraint plan_request_medical_history_position_unique
    unique (request_id, position)
);

comment on table public.plan_request_medical_history is
  '가입자 병력. plan_request 1:N. 한 요청당 최대 20건은 앱 레이어 (zod) 에서 enforce.';

create index plan_request_medical_history_request_id_idx
  on public.plan_request_medical_history (request_id);

-- ============================================================
-- plan_request_candidate — 후보 / 선택 (M:N)
-- ============================================================
-- agents 테이블이 아직 DB 가 아니라 agent_id 는 text + FK 없음.
-- agents DB 화 시 ALTER TABLE ... ADD CONSTRAINT 로 FK 추가.

create table public.plan_request_candidate (
  request_id text not null references public.plan_request(id) on delete cascade,
  agent_id text not null,

  candidate_rank int not null,
  selected boolean not null default false,

  created_at timestamptz not null default now(),

  primary key (request_id, agent_id),
  constraint plan_request_candidate_rank_unique
    unique (request_id, candidate_rank)
);

comment on table public.plan_request_candidate is
  'M:N junction (요청 ↔ 후보 설계사). selected=true 인 row 가 가입자 선택 K명. agent_id FK 는 agents DB 화 후 ALTER 추가.';

create index plan_request_candidate_request_id_idx
  on public.plan_request_candidate (request_id);

create index plan_request_candidate_agent_id_idx
  on public.plan_request_candidate (agent_id);

create index plan_request_candidate_selected_idx
  on public.plan_request_candidate (request_id)
  where selected;

-- ============================================================
-- RLS — server-side service_role 만 access (deny-by-default)
-- ============================================================

alter table public.plan_request enable row level security;
alter table public.plan_request_medical_history enable row level security;
alter table public.plan_request_candidate enable row level security;
