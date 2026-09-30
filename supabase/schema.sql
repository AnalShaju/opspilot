-- OpsPilot expected Supabase schema
-- Run in the Supabase SQL editor if your tables differ from this layout.
-- App IDs stay human-readable text (INC-001, HIST-001, RT-001).

create table if not exists incidents (
  id text primary key,
  code text not null,
  service text not null,
  title text not null,
  description text not null,
  severity text not null,
  status text not null,
  error_rate double precision,
  incident_type text,
  source text,
  scenario_id text,
  resilience_test_id text,
  root_cause jsonb,
  recommended_action jsonb,
  approval jsonb,
  recovery jsonb,
  report jsonb,
  investigation jsonb,
  recovery_duration_ms bigint,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists incident_evidence (
  id uuid primary key default gen_random_uuid(),
  incident_id text not null references incidents(id) on delete cascade,
  logs jsonb,
  metrics jsonb,
  deployments jsonb,
  services jsonb,
  health jsonb,
  previous_incidents jsonb,
  bag jsonb,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (incident_id)
);

create table if not exists incident_investigations (
  id uuid primary key default gen_random_uuid(),
  incident_id text not null references incidents(id) on delete cascade,
  root_cause text,
  confidence double precision,
  evidence_summary jsonb,
  investigation_summary text,
  recommended_action text,
  recommended_service text,
  recommended_version text,
  recommendation_reason text,
  ai_provider text not null default 'deepseek',
  incident_type text,
  steps jsonb,
  history_record_ids jsonb,
  ai_call_count integer,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id)
);

create table if not exists remediation_actions (
  id uuid primary key default gen_random_uuid(),
  incident_id text not null references incidents(id) on delete cascade,
  action_type text,
  target text,
  service text,
  risk text,
  approved boolean,
  approved_at timestamptz,
  approved_by text,
  executed boolean,
  executed_at timestamptz,
  result text,
  verified boolean,
  verified_at timestamptz,
  verification_result text,
  verification_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id)
);

create table if not exists incident_history (
  id text primary key,
  incident_id text not null,
  incident_type text not null,
  service text not null,
  root_cause text not null,
  confidence double precision not null,
  evidence_summary jsonb not null default '[]'::jsonb,
  recommended_action text not null,
  action_type text not null,
  action_target text not null,
  action_result text not null,
  verification_result text not null,
  outcome text not null check (outcome in ('resolved', 'failed')),
  resolved_at timestamptz not null,
  recovery_duration_ms bigint,
  created_at timestamptz not null default now()
);

create index if not exists incident_history_service_idx
  on incident_history (service);
create index if not exists incident_history_outcome_idx
  on incident_history (outcome, resolved_at desc);

create table if not exists resilience_tests (
  test_id text primary key,
  scenario text not null,
  scenario_name text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  incident_id text,
  detection_status text not null,
  investigation_status text not null,
  recommendation_status text not null,
  approval_status text not null,
  remediation_status text not null,
  verification_status text not null,
  overall_status text not null,
  recovery_duration_ms bigint,
  failure_reason text,
  triggered_at timestamptz,
  detected_at timestamptz,
  investigation_completed_at timestamptz,
  approved_at timestamptz,
  remediated_at timestamptz,
  verified_at timestamptz,
  root_cause_summary text,
  confidence double precision,
  recommended_action_type text,
  recommended_action_target text,
  remediation_result text,
  verification_result text,
  evaluation jsonb not null default '{}'::jsonb,
  approval_timeout_ms integer not null default 600000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists resilience_test_results (
  id uuid primary key default gen_random_uuid(),
  test_id text not null references resilience_tests(test_id) on delete cascade,
  expected_action text,
  actual_action text,
  expected_service text,
  actual_service text,
  detection_success boolean not null default false,
  investigation_success boolean not null default false,
  remediation_success boolean not null default false,
  verification_success boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (test_id)
);
