-- 박스별 단말기(IH/기종) 트래킹
-- 자재창고 지도에서 "단말기" 분류 박스 안의 개별 단말기(IH번호 + 기종)를 관리.
-- 택시단말기 현황 "자재센터 보관"에서 랙·박스에 일괄 지정 가능.
-- 택시단말기 현황에서 입·출고하면 해당 IH가 박스에서 자동 제거됨.
-- ⚠️ Supabase SQL Editor 에서 1회 실행하세요.

create table if not exists public.box_terminals (
  id          uuid primary key default gen_random_uuid(),
  warehouse_id bigint references public.warehouse(id) on delete set null, -- 박스(재고 항목), 좌표지정은 null 가능
  location    text,
  rack_no     text,
  shelf       text,
  box_no      text,
  trcn_id     text not null unique,          -- IH 단말기 번호 (한 단말기는 한 박스에만)
  device_type text,                          -- 기종
  source      text not null default 'manual',-- 'manual' | 'taxi'
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_box_terminals_warehouse on public.box_terminals(warehouse_id);
create index if not exists idx_box_terminals_box        on public.box_terminals(location, rack_no, shelf, box_no);

-- 앱은 anon key 로 접근(다른 테이블과 동일) → RLS 비활성화
alter table public.box_terminals disable row level security;
