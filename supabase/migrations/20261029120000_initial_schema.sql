-- PathIITR initial schema: content tables (loaded by scripts/ with the secret key, read-only to the
-- app), per-user tables (profile, chats, feedback) and a server-only LLM answer cache.
-- Row-level security is on for every table. Run once in the Supabase SQL Editor.

begin;

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- Mirrors isAllowedSession() in lib/auth.ts: an IITR email (incl. department subdomains), the
-- account is linked to Google, and the session was created by OAuth.
create or replace function public.is_iitr_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() ->> 'email') ~* '@([a-z0-9-]+\.)*iitr\.ac\.in$'
    and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr'
             else '[]'::jsonb end
      ) as entry
      -- amr entries are {"method": "oauth", "timestamp": ...}; plain strings are accepted too
      where coalesce(entry ->> 'method', entry #>> '{}') = 'oauth'
    ),
    false
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Content tables
-- ---------------------------------------------------------------------------------------------

create table public.tracks (
  name text primary key,
  sort_order smallint not null,
  is_career boolean not null default true,
  blurb text
);

insert into public.tracks (name, sort_order, is_career) values
  ('Software', 1, true),
  ('Quant/HFT', 2, true),
  ('Data Science', 3, true),
  ('Analyst', 4, true),
  ('Consulting/PM', 5, true),
  ('ECE Core', 6, true),
  ('Cross-track', 7, false);

-- One row per source document. id is the doc slug from scripts/embed.py (<display_title slug>-<sha8>).
-- Deliberately no file path / original file name: those can contain people's names.
create table public.documents (
  id text primary key,
  display_title text not null,
  kind text not null check (kind in ('guidance', 'reference', 'curriculum')),
  tracks text[] not null default '{}',
  doc_type text,
  summary text,
  topics text[],
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table public.chunks (
  id text primary key,
  document_id text not null references public.documents (id) on delete cascade,
  chunk_index integer not null,
  source text not null check (source in ('clean_text', 'courses_json', 'structured_summary')),
  heading text,
  page_start integer,
  page_end integer,
  tracks text[] not null default '{}',
  n_tokens integer not null check (n_tokens between 1 and 512),
  content text not null,
  embedding extensions.vector(384) not null,  -- gte-small, L2-normalised
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index chunks_embedding_idx on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops);
create index chunks_tracks_idx on public.chunks using gin (tracks);

-- Interview / internship experiences pulled out by scripts/structure.py. No person fields.
create table public.experiences (
  id bigint generated always as identity primary key,
  document_id text not null references public.documents (id) on delete cascade,
  item_index integer not null,
  company text,
  role text,
  year smallint check (year between 2000 and 2100),
  track text references public.tracks (name) on update cascade,
  eligibility text,
  rounds jsonb not null default '[]' check (jsonb_typeof(rounds) = 'array'),  -- [{name, details}]
  skills text[] not null default '{}',
  tips text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (document_id, item_index)
);

create index experiences_track_idx on public.experiences (track);

create table public.skill_matrix (
  id bigint generated always as identity primary key,
  track text not null references public.tracks (name) on update cascade,
  skill text not null,
  level text not null check (level in ('core', 'nice_to_have')),
  sub_area text,
  evidence text[] not null default '{}',
  resources jsonb not null default '[]' check (jsonb_typeof(resources) = 'array'),  -- [{title, url, source, host}]
  unique (track, skill)
);

-- courses.json merged with elective_tracks.json (the track mapping is based on course titles only).
create table public.courses (
  code text primary key,
  name text not null,
  credits smallint not null check (credits >= 0),
  year smallint check (year between 1 and 5),
  semester text check (semester in ('Autumn', 'Spring')),
  category text not null check (category in ('core', 'elective')),
  subject_area text,
  elective_group text,
  lists text[] not null default '{}',
  offered text check (offered in ('Autumn', 'Spring')),
  topics text[],
  tracks_helped text[] not null default '{}',
  sub_area text,
  track_reason text
);

-- Elective slots in the curriculum structure (HSSEC-I, OEC, ...), for the semester roadmap.
create table public.curriculum_slots (
  slot text primary key,
  name text not null,
  year smallint not null check (year between 1 and 5),
  semester text not null check (semester in ('Autumn', 'Spring')),
  subject_area text,
  credits smallint not null check (credits >= 0)
);

-- ---------------------------------------------------------------------------------------------
-- Retrieval
-- ---------------------------------------------------------------------------------------------

-- Top chunks for a question embedding. Guidance and curriculum chunks get a small score boost so
-- reference summaries don't crowd out seniors' advice when similarity is close.
-- filter_tracks matches chunks.tracks; curriculum chunks are tagged 'curriculum', so include it
-- in the filter when course content should stay in.
create or replace function public.match_chunks(
  query_embedding extensions.vector(384),
  match_count integer default 5,
  filter_tracks text[] default null,
  prefer_guidance boolean default true
)
returns table (
  id text,
  document_id text,
  display_title text,
  kind text,
  heading text,
  page_start integer,
  tracks text[],
  content text,
  similarity double precision,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- match_count is clamped to 1..8 (lean prompts). The nearest 4x candidates by raw distance are
  -- fetched first, then re-ranked by score.
  with candidates as (
    select c.id, c.document_id, c.heading, c.page_start, c.tracks, c.content,
           c.embedding operator(extensions.<=>) query_embedding as distance
    from public.chunks c
    where filter_tracks is null
       or cardinality(filter_tracks) = 0
       or c.tracks && filter_tracks
    order by c.embedding operator(extensions.<=>) query_embedding
    limit least(greatest(coalesce(match_count, 5), 1), 8) * 4
  )
  select ca.id, ca.document_id, d.display_title, d.kind, ca.heading, ca.page_start, ca.tracks,
         ca.content,
         1 - ca.distance as similarity,
         1 - ca.distance
           + case when prefer_guidance and d.kind in ('guidance', 'curriculum')
                  then 0.03::double precision  -- guidance boost; tune here
                  else 0::double precision end as score
  from candidates ca
  join public.documents d on d.id = ca.document_id
  order by score desc, similarity desc
  limit least(greatest(coalesce(match_count, 5), 1), 8);
$$;

-- ---------------------------------------------------------------------------------------------
-- Per-user tables
-- ---------------------------------------------------------------------------------------------

-- No email or name here: the email already lives in auth.users. The app upserts this row.
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  branch text check (char_length(branch) <= 60),
  study_year smallint check (study_year between 1 and 5),
  interests text[] not null default '{}' check (cardinality(interests) <= 30),
  skills text[] not null default '{}' check (cardinality(skills) <= 80),
  target_tracks text[] not null default '{}' check (cardinality(target_tracks) <= 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Server-only cache of non-personalised answers. cache_key = sha256 of normalised question +
-- track filter + prompt version. No policies: only the secret key (chat API route) touches it.
create table public.llm_cache (
  id bigint generated always as identity primary key,
  cache_key text not null unique check (cache_key ~ '^[0-9a-f]{64}$'),
  question text not null,
  answer text not null,
  citations jsonb not null default '[]' check (jsonb_typeof(citations) = 'array'),
  provider text,
  model text,
  prompt_version text not null,
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index conversations_user_idx on public.conversations (user_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- The composite foreign key means a message can only point at a conversation owned by the same user.
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  citations jsonb not null default '[]' check (jsonb_typeof(citations) = 'array'),
  provider text,
  model text,
  cache_id bigint references public.llm_cache (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (conversation_id, user_id)
    references public.conversations (id, user_id) on delete cascade
);

create index chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at);
create index chat_messages_user_idx on public.chat_messages (user_id);
create index chat_messages_cache_idx on public.chat_messages (cache_id);

-- Thumbs up/down, one per assistant message, owned by the same user as the message.
create table public.message_feedback (
  message_id uuid primary key,
  user_id uuid not null default auth.uid(),
  rating smallint not null check (rating in (-1, 1)),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (message_id, user_id)
    references public.chat_messages (id, user_id) on delete cascade
);

create index message_feedback_user_idx on public.message_feedback (user_id);

create trigger message_feedback_set_updated_at
  before update on public.message_feedback
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Privileges: explicit, not relying on Supabase's default grants.
-- ---------------------------------------------------------------------------------------------

revoke all on
  public.tracks, public.documents, public.chunks, public.experiences, public.skill_matrix,
  public.courses, public.curriculum_slots, public.profiles, public.llm_cache,
  public.conversations, public.chat_messages, public.message_feedback
from anon, authenticated;

grant all on
  public.tracks, public.documents, public.chunks, public.experiences, public.skill_matrix,
  public.courses, public.curriculum_slots, public.profiles, public.llm_cache,
  public.conversations, public.chat_messages, public.message_feedback
to service_role;

grant select on
  public.tracks, public.documents, public.chunks, public.experiences, public.skill_matrix,
  public.courses, public.curriculum_slots
to authenticated;

grant select, insert, update, delete on public.profiles, public.conversations, public.message_feedback
to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;

revoke all on function public.is_iitr_user() from public, anon;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.match_chunks(extensions.vector, integer, text[], boolean) from public, anon;
grant execute on function public.is_iitr_user() to authenticated, service_role;
grant execute on function public.match_chunks(extensions.vector, integer, text[], boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.tracks enable row level security;
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.experiences enable row level security;
alter table public.skill_matrix enable row level security;
alter table public.courses enable row level security;
alter table public.curriculum_slots enable row level security;
alter table public.profiles enable row level security;
alter table public.llm_cache enable row level security;  -- no policies: server-only
alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.message_feedback enable row level security;

-- Content: any logged-in IITR user may read; nobody but the secret key may write.
create policy "IITR users read tracks" on public.tracks
  for select to authenticated using ((select public.is_iitr_user()));
create policy "IITR users read documents" on public.documents
  for select to authenticated using ((select public.is_iitr_user()));
create policy "IITR users read chunks" on public.chunks
  for select to authenticated using ((select public.is_iitr_user()));
create policy "IITR users read experiences" on public.experiences
  for select to authenticated using ((select public.is_iitr_user()));
create policy "IITR users read skill matrix" on public.skill_matrix
  for select to authenticated using ((select public.is_iitr_user()));
create policy "IITR users read courses" on public.courses
  for select to authenticated using ((select public.is_iitr_user()));
create policy "IITR users read curriculum slots" on public.curriculum_slots
  for select to authenticated using ((select public.is_iitr_user()));

-- Profiles: own row only.
create policy "Users read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) and (select public.is_iitr_user()));
create policy "Users create own profile" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and (select public.is_iitr_user()));
create policy "Users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_iitr_user()))
  with check (id = (select auth.uid()) and (select public.is_iitr_user()));
create policy "Users delete own profile" on public.profiles
  for delete to authenticated
  using (id = (select auth.uid()) and (select public.is_iitr_user()));

-- Conversations: own rows only.
create policy "Users read own conversations" on public.conversations
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_iitr_user()));
create policy "Users create own conversations" on public.conversations
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_iitr_user()));
create policy "Users update own conversations" on public.conversations
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_iitr_user()))
  with check (user_id = (select auth.uid()) and (select public.is_iitr_user()));
create policy "Users delete own conversations" on public.conversations
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_iitr_user()));

-- Chat messages: own rows only; no update, so history can't be rewritten.
create policy "Users read own messages" on public.chat_messages
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_iitr_user()));
create policy "Users add own messages" on public.chat_messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_iitr_user()));
create policy "Users delete own messages" on public.chat_messages
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_iitr_user()));

-- Feedback: own rows only, and only on assistant messages.
create policy "Users read own feedback" on public.message_feedback
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_iitr_user()));
create policy "Users rate own assistant messages" on public.message_feedback
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and (select public.is_iitr_user())
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_feedback.message_id and m.role = 'assistant'
    )
  );
create policy "Users change own feedback" on public.message_feedback
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_iitr_user()))
  with check (
    user_id = (select auth.uid()) and (select public.is_iitr_user())
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_feedback.message_id and m.role = 'assistant'
    )
  );
create policy "Users delete own feedback" on public.message_feedback
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_iitr_user()));

commit;
