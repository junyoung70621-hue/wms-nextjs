-- 푸시 알림 구독 정보 (브라우저/기기별 1행)
-- Supabase SQL Editor에 붙여넣어 실행하세요.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  endpoint    text not null unique,          -- 푸시 서비스 엔드포인트(기기 식별)
  p256dh      text not null,                 -- 구독 공개키
  auth        text not null,                 -- 구독 auth secret
  user_agent  text,
  created_at  timestamptz default now()
);

create index if not exists idx_push_sub_user on public.push_subscriptions(user_id);

-- 앱이 anon key로 접근하므로 RLS 비활성화 (다른 테이블과 동일)
alter table public.push_subscriptions disable row level security;
