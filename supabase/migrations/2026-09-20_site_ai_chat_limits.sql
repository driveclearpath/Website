-- Durable spend guard for the public ClearPath Automotive AI advisor.
create table if not exists site_ai_chat_usage (
  id bigserial primary key,
  ip_address text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_ai_chat_usage_ip_time
  on site_ai_chat_usage(ip_address, created_at desc);

create index if not exists idx_site_ai_chat_usage_time
  on site_ai_chat_usage(created_at desc);

alter table site_ai_chat_usage enable row level security;
-- No client policies: service-role access only.
