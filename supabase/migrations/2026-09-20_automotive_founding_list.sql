create table if not exists automotive_founding_list (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text not null unique,
  zip text,
  status text not null default 'subscribed'
    check (status in ('subscribed', 'unsubscribed', 'bounced')),
  source text not null default 'website_opening_list',
  marketing_email_opt_in boolean not null default true,
  consent_language text not null,
  consented_at timestamptz not null default now(),
  netlify_submission_id text unique,
  confirmation_sent_at timestamptz,
  resend_email_id text,
  last_signup_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automotive_founding_list_zip_format
    check (zip is null or zip ~ '^[0-9]{5}(-[0-9]{4})?$')
);

create index if not exists idx_automotive_founding_list_status
  on automotive_founding_list(status, created_at desc);

create index if not exists idx_automotive_founding_list_zip
  on automotive_founding_list(zip)
  where zip is not null;

alter table automotive_founding_list enable row level security;
-- No browser policies: only trusted server-side functions use the service role.

comment on table automotive_founding_list is
  'ClearPath Automotive pre-opening prospects who explicitly joined the website founding list.';
