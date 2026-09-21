create extension if not exists pgcrypto;

alter table public.automotive_founding_list
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid(),
  add column if not exists unsubscribed_at timestamptz;

create unique index if not exists automotive_founding_list_unsubscribe_token_idx
  on public.automotive_founding_list (unsubscribe_token);

create table if not exists public.automotive_founding_list_updates (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  headline text not null,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'draft' check (status in ('draft','sending','sent','partial','failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.automotive_founding_list_updates enable row level security;
revoke all on public.automotive_founding_list_updates from anon, authenticated;
