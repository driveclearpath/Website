-- Public intake (driveclearpath.com "Talk to us" AI path) — schema v1
-- Lives in the same Supabase project as expert_intake_*, namespaced with `public_intake_` prefix.
-- Run with: node --env-file=.env scripts/run-migration.mjs supabase/migrations/2026-05-05_public_intake.sql

-- ==============================================================
-- Tables
-- ==============================================================

-- Every entry attempt — successful and rejected — for rate limiting and abuse audit.
create table if not exists public_intake_attempts (
  id bigserial primary key,
  ip_address text,                       -- Netlify-provided client IP
  user_agent text,
  outcome text not null check (outcome in (
    'created',
    'rate_limited_minute',
    'rate_limited_day',
    'turnstile_failed',
    'honeypot_tripped',
    'invalid_email',
    'disposable_email',
    'invalid_name',
    'invalid_payload'
  )),
  email_normalized text,                 -- lowercased, only stored if visitor provided one
  session_id uuid,                       -- set when outcome = 'created'
  attempted_at timestamptz default now()
);

create index if not exists idx_public_intake_attempts_ip_time
  on public_intake_attempts(ip_address, attempted_at desc);

create index if not exists idx_public_intake_attempts_email_time
  on public_intake_attempts(email_normalized, attempted_at desc)
  where email_normalized is not null;

-- The intake session itself.
create table if not exists public_intake_responses (
  id uuid primary key default gen_random_uuid(),

  -- Client-facing auth token. Generated server-side at validate-entry, returned to the
  -- browser, and required on every subsequent chat-turn / submit call. Never logged
  -- client-side; only stored in sessionStorage during the conversation.
  session_token uuid unique not null default gen_random_uuid(),

  -- Visitor-provided identity (collected at entry, before chat starts)
  visitor_name text not null,
  visitor_email text not null,
  visitor_email_normalized text not null,

  -- Network identity (for abuse correlation only — not displayed to Brad)
  ip_address text,
  user_agent text,

  -- Conversation state — same shape as expert_intake_responses for consistency
  channel text not null default 'text' check (channel = 'text'),
  messages jsonb not null default '[]'::jsonb,   -- Claude-format message array
  answers jsonb not null default '{}'::jsonb,    -- keyed by "objective_id.field"
  flags jsonb not null default '[]'::jsonb,
  skipped jsonb not null default '[]'::jsonb,
  transcript text,
  turn_count int not null default 0,

  -- AI conclusion
  conclusion_reason text,                -- objectives_covered | visitor_ready_to_end | out_of_time | no_email | low_engagement | not_legitimate | user_ended_manually | window_closed
  conclusion_summary text,
  fit_read text check (fit_read in ('strong','possible','weak','not_a_fit','unclear')),

  -- Quality gate (computed at submit-time)
  quality_passed boolean not null default false,
  quality_reasons jsonb,                 -- array of strings explaining pass/fail decisions

  -- Magic-link confirmation (Brad is only notified after this is set)
  confirmation_token uuid unique,
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,

  -- Brad notification (kept distinct from confirmed_at so we can retry if Resend fails)
  notified_brad_at timestamptz,

  -- Lifecycle
  started_at timestamptz not null default now(),
  submitted_at timestamptz,              -- when conversation ended (with or without confirmation)
  created_at timestamptz not null default now()
);

create index if not exists idx_public_intake_responses_email
  on public_intake_responses(visitor_email_normalized);

create index if not exists idx_public_intake_responses_started
  on public_intake_responses(started_at desc);

create index if not exists idx_public_intake_responses_pending_confirm
  on public_intake_responses(confirmation_token)
  where confirmation_token is not null and confirmed_at is null;

-- ==============================================================
-- RLS — service-role only
-- ==============================================================
-- All access goes through Netlify functions using the service-role key.
-- Anonymous / authenticated client roles get nothing. There is no Brad-facing
-- read surface yet (the optional admin page is a later add); when it ships
-- it will use a separate auth-gated view, not direct table reads.

alter table public_intake_attempts enable row level security;
alter table public_intake_responses enable row level security;

-- (No policies defined → service role bypasses RLS via the service key,
--  anon/authenticated have no access. This is the lock-down we want.)

-- ==============================================================
-- Helper view — for Brad's future admin surface
-- ==============================================================
-- Hides the messages/transcript blob (which can be huge) and surfaces just
-- the row metadata for an at-a-glance dashboard query.

create or replace view public_intake_summary as
select
  id,
  session_token,
  visitor_name,
  visitor_email,
  conclusion_reason,
  conclusion_summary,
  fit_read,
  quality_passed,
  confirmed_at is not null as is_confirmed,
  notified_brad_at is not null as brad_notified,
  jsonb_array_length(coalesce(flags, '[]'::jsonb)) as flag_count,
  jsonb_array_length(coalesce(messages, '[]'::jsonb)) as message_count,
  turn_count,
  started_at,
  submitted_at
from public_intake_responses;

comment on view public_intake_summary is
  'At-a-glance row metadata for the public intake. Use this in admin queries; pull the full row only when reviewing transcript.';
