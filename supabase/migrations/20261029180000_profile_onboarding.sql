-- Onboarding profile: self-rated skill levels per skill area, plus the stored career recommendation.
-- Run once in the Supabase SQL Editor after 20261029120000_initial_schema.sql.
-- The existing own-row RLS policies and table grants on profiles cover the new columns.

begin;

-- `skills text[]` was never used; levels per skill area replace it.
alter table public.profiles drop column skills;

-- skill_levels: {"<area id>": 0..3}, area ids from lib/careers/skills.ts (0 none, 1 beginner,
-- 2 intermediate, 3 strong). Shared by the career recommender and the skill-gap page.
alter table public.profiles
  add column skill_levels jsonb not null default '{}'
    constraint profiles_skill_levels_shape check (
      jsonb_typeof(skill_levels) = 'object'
      and jsonb_array_length(jsonb_path_query_array(skill_levels, '$.keyvalue()')) <= 40
      and not jsonb_path_exists(skill_levels, '$.keyvalue() ? (!(@.key like_regex "^[a-z0-9_]{1,32}$"))')
      and not jsonb_path_exists(skill_levels, '$.* ? (@.type() != "number")')
      and not jsonb_path_exists(skill_levels, '$.* ? (@ < 0 || @ > 3 || @.floor() != @)')
    ),
  -- {version, inputHash, top: [...], explanation}: rule-based result plus the LLM's friendly
  -- explanation, so the LLM runs once per profile change, not per page view.
  add column recommendation jsonb
    constraint profiles_recommendation_shape check (
      recommendation is null
      or (jsonb_typeof(recommendation) = 'object' and pg_column_size(recommendation) <= 16000)
    ),
  add column onboarded_at timestamptz;

commit;
