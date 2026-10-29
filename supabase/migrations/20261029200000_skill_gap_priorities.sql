-- Skill-gap page: the LLM's "what to learn first" text, stored per track so it is written once per
-- profile change, not per page view. Run once in the Supabase SQL Editor after
-- 20261029180000_profile_onboarding.sql. The existing own-row RLS policies and grants on profiles cover it.

begin;

-- {"<track>": {"version": 1, "inputHash": "<sha256>", "text": "..."}}; text "" means the LLM's
-- answer failed our checks and is hidden.
alter table public.profiles
  add column skill_gap jsonb not null default '{}'
    constraint profiles_skill_gap_shape check (
      jsonb_typeof(skill_gap) = 'object' and pg_column_size(skill_gap) <= 16000
    );

commit;
