-- PathIITR RLS / grants test. Paste the whole file into the Supabase SQL Editor and run it.
--
-- Seeds fake users and rows, runs each test as anon / authenticated with forged JWT claims, and
-- undoes every write before returning: each test runs in its own subtransaction that is rolled
-- back, and the seed is rolled back by a deliberate exception at the end. This is the same as
-- wrapping everything in begin ... rollback, but the results are still returned (the SQL Editor
-- only shows the last statement's output). If anything unexpected errors, the whole statement
-- fails and nothing is kept either.
--
-- Expected: row 0 (SUMMARY) says all tests passed; any failing row shows expected vs got.

create or replace function pg_temp.pathiitr_rls_tests()
returns table (n int, test text, expected text, got text, ok boolean)
language plpgsql
as $fn$
#variable_conflict use_column
declare
  ua constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';   -- IITR student A
  ub constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';   -- IITR student B
  ug constant uuid := 'aaaaaaaa-0000-4000-8000-000000000003';   -- non-IITR Google account
  ca constant uuid := 'aaaaaaaa-0000-4000-8000-0000000000c1';   -- A's conversation
  cb constant uuid := 'aaaaaaaa-0000-4000-8000-0000000000c2';   -- B's conversation
  mau constant uuid := 'aaaaaaaa-0000-4000-8000-0000000000a1';  -- A's user message
  maa constant uuid := 'aaaaaaaa-0000-4000-8000-0000000000a2';  -- A's assistant message
  mba constant uuid := 'aaaaaaaa-0000-4000-8000-0000000000b2';  -- B's assistant message
  dom constant text := 'iitr.ac.in';  -- test emails are built from this so no full address is written out
  e1 constant text := '[1' || repeat(',0', 383) || ']';
  near_e1 constant text := '[0.98058,0.19612' || repeat(',0', 382) || ']';  -- cosine 0.981 to e1
  e3 constant text := '[0,0,1' || repeat(',0', 381) || ']';
  tokens jsonb;
  results jsonb := '[]';
  t record;
  stmt text;
  k text;
  cnt bigint;
  res text;
begin
  tokens := jsonb_build_object(
    'A', quote_literal(ua) || '::uuid', 'B', quote_literal(ub) || '::uuid',
    'cA', quote_literal(ca) || '::uuid', 'cB', quote_literal(cb) || '::uuid',
    'mAu', quote_literal(mau) || '::uuid', 'mAa', quote_literal(maa) || '::uuid',
    'mBa', quote_literal(mba) || '::uuid',
    'q', quote_literal(e1) || '::extensions.vector');

  begin
    -- Seed (as postgres) ---------------------------------------------------------------------
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
    select '00000000-0000-0000-0000-000000000000'::uuid, v.id, 'authenticated', 'authenticated', v.email,
           '{"provider":"google","providers":["google"]}'::jsonb, now(), now()
    from (values (ua, 'test.alpha@ece.' || dom), (ub, 'test.beta@' || dom),
                 (ug, 'test.gamma@example.com')) v(id, email);

    insert into public.documents (id, display_title, kind, tracks) values
      ('zz-test-guide', 'Test guidance doc', 'guidance', '{Software}'),
      ('zz-test-ref', 'Test reference doc', 'reference', '{Quant/HFT}'),
      ('zz-test-fill', 'Test filler doc', 'curriculum', '{curriculum}');
    insert into public.chunks (id, document_id, chunk_index, source, tracks, n_tokens, content, embedding)
    values ('zz-test-guide-0', 'zz-test-guide', 0, 'clean_text', '{Software}', 10, 'guide',
            near_e1::extensions.vector),
           ('zz-test-ref-0', 'zz-test-ref', 0, 'structured_summary', '{Quant/HFT}', 10, 'ref',
            e1::extensions.vector);
    insert into public.chunks (id, document_id, chunk_index, source, tracks, n_tokens, content, embedding)
    select 'zz-test-fill-' || i, 'zz-test-fill', i, 'courses_json', '{curriculum}'::text[], 10, 'filler',
           e3::extensions.vector
    from generate_series(0, 9) i;
    insert into public.llm_cache (cache_key, question, answer, prompt_version)
    values (repeat('0', 64), 'test question', 'test answer', 'test');

    insert into public.profiles (id, branch) values (ub, 'ECE');
    insert into public.conversations (id, user_id, title) values (ca, ua, 'A chat'), (cb, ub, 'B chat');
    insert into public.chat_messages (id, conversation_id, user_id, role, content) values
      (mau, ca, ua, 'user', 'question'),
      (maa, ca, ua, 'assistant', 'answer'),
      (mba, cb, ub, 'assistant', 'answer');
    insert into public.message_feedback (message_id, user_id, rating) values (mba, ub, 1);

    -- Tests ----------------------------------------------------------------------------------
    for t in
      with who (who, role, sub, email, providers, amr) as (values
        ('A',         'authenticated', ua, 'test.alpha@ece.' || dom,   '["google"]'::jsonb, '[{"method":"oauth","timestamp":1}]'::jsonb),
        ('B',         'authenticated', ub, 'test.beta@' || dom,        '["google"]',        '[{"method":"oauth","timestamp":1}]'),
        ('G',         'authenticated', ug, 'test.gamma@example.com',    '["google"]',        '[{"method":"oauth","timestamp":1}]'),
        ('A_pw',      'authenticated', ua, 'test.alpha@ece.' || dom,   '["google","email"]', '[{"method":"password","timestamp":1}]'),
        ('upper',     'authenticated', ug, upper('test.alpha@ece.' || dom), '["google"]',        '[{"method":"oauth","timestamp":1}]'),
        ('amr_str',   'authenticated', ug, 'test.alpha@' || dom,       '["google"]',        '["oauth"]'),
        ('evil',      'authenticated', ug, 'test@' || dom || '.evil.com', '["google"]',        '[{"method":"oauth","timestamp":1}]'),
        ('notiitr',   'authenticated', ug, 'test@notiitr.ac.in',        '["google"]',        '[{"method":"oauth","timestamp":1}]'),
        ('email_prov','authenticated', ug, 'test.alpha@' || dom,       '["email"]',         '[{"method":"oauth","timestamp":1}]'),
        ('otp',       'authenticated', ug, 'test.alpha@' || dom,       '["google"]',        '[{"method":"otp","timestamp":1}]'),
        ('no_amr',    'authenticated', ug, 'test.alpha@' || dom,       '["google"]',        null),
        ('anon',      'anon',          null, null,                       null,                null)
      ),
      tests (label, who, stmt, want) as (values
        -- is_iitr_user() claim handling
        ('is_iitr_user: dept subdomain, Google, OAuth', 'A', 'select 1 where public.is_iitr_user()', '1'),
        ('is_iitr_user: root domain', 'B', 'select 1 where public.is_iitr_user()', '1'),
        ('is_iitr_user: uppercase email', 'upper', 'select 1 where public.is_iitr_user()', '1'),
        ('is_iitr_user: amr as plain strings', 'amr_str', 'select 1 where public.is_iitr_user()', '1'),
        ('is_iitr_user: non-IITR email', 'G', 'select 1 where public.is_iitr_user()', '0'),
        ('is_iitr_user: iitr.ac.in.evil.com', 'evil', 'select 1 where public.is_iitr_user()', '0'),
        ('is_iitr_user: notiitr.ac.in', 'notiitr', 'select 1 where public.is_iitr_user()', '0'),
        ('is_iitr_user: not linked to Google', 'email_prov', 'select 1 where public.is_iitr_user()', '0'),
        ('is_iitr_user: password session', 'A_pw', 'select 1 where public.is_iitr_user()', '0'),
        ('is_iitr_user: magic-link (otp) session', 'otp', 'select 1 where public.is_iitr_user()', '0'),
        ('is_iitr_user: no amr claim', 'no_amr', 'select 1 where public.is_iitr_user()', '0'),
        ('is_iitr_user: anon cannot call', 'anon', 'select 1 where public.is_iitr_user()', 'ERR:42501'),

        -- Content tables
        ('IITR user reads tracks', 'A', 'select 1 from public.tracks', '7'),
        ('IITR user reads test documents', 'A', 'select 1 from public.documents where id like $$zz-test-%$$', '3'),
        ('IITR user reads test chunks', 'A', 'select 1 from public.chunks where document_id like $$zz-test-%$$', '12'),
        ('IITR user can query experiences, skill_matrix, courses, slots', 'A',
         'select 1 from public.experiences, public.skill_matrix, public.courses, public.curriculum_slots limit 0', '0'),
        ('Non-IITR user sees no tracks', 'G', 'select 1 from public.tracks', '0'),
        ('Non-IITR user sees no chunks', 'G', 'select 1 from public.chunks where document_id like $$zz-test-%$$', '0'),
        ('Password session sees no tracks', 'A_pw', 'select 1 from public.tracks', '0'),
        ('anon cannot read tracks', 'anon', 'select 1 from public.tracks', 'ERR:42501'),
        ('anon cannot read chunks', 'anon', 'select 1 from public.chunks', 'ERR:42501'),
        ('IITR user cannot insert tracks', 'A', 'insert into public.tracks (name, sort_order) values ($$Fake$$, 99)', 'ERR:42501'),
        ('IITR user cannot update documents', 'A', 'update public.documents set summary = $$x$$', 'ERR:42501'),
        ('IITR user cannot delete chunks', 'A', 'delete from public.chunks', 'ERR:42501'),
        ('IITR user cannot read llm_cache', 'A', 'select 1 from public.llm_cache', 'ERR:42501'),
        ('IITR user cannot write llm_cache', 'A',
         'insert into public.llm_cache (cache_key, question, answer, prompt_version) values (repeat($$1$$, 64), $$q$$, $$a$$, $$v$$)',
         'ERR:42501'),

        -- match_chunks
        ('match_chunks: default count is 5', 'A', 'select 1 from public.match_chunks({q})', '5'),
        ('match_chunks: count capped at 8', 'A', 'select 1 from public.match_chunks({q}, 50)', '8'),
        ('match_chunks: count 0 clamps to 1', 'A', 'select 1 from public.match_chunks({q}, 0)', '1'),
        ('match_chunks: guidance boost beats slightly closer reference', 'A',
         'select 1 from public.match_chunks({q}, 1) where document_id = $$zz-test-guide$$', '1'),
        ('match_chunks: without boost the closer reference wins', 'A',
         'select 1 from public.match_chunks({q}, 1, null, false) where document_id = $$zz-test-ref$$', '1'),
        ('match_chunks: track filter drops other tracks', 'A',
         'select 1 from public.match_chunks({q}, 8, array[$$Quant/HFT$$]) where document_id like $$zz-test-%$$ and document_id <> $$zz-test-ref$$',
         '0'),
        ('match_chunks: non-IITR user gets nothing', 'G', 'select 1 from public.match_chunks({q}, 8)', '0'),
        ('match_chunks: anon cannot call', 'anon', 'select 1 from public.match_chunks({q})', 'ERR:42501'),

        -- Profiles
        ('Profiles: A cannot see B profile', 'A', 'select 1 from public.profiles', '0'),
        ('Profiles: A creates own profile', 'A', 'insert into public.profiles (branch) values ($$ECE$$)', '1'),
        ('Profiles: A cannot create profile for B', 'A', 'insert into public.profiles (id, branch) values ({B}, $$ECE$$)', 'ERR:42501'),
        ('Profiles: A cannot update B profile', 'A', 'update public.profiles set branch = $$x$$ where id = {B}', '0'),
        ('Profiles: A cannot delete B profile', 'A', 'delete from public.profiles where id = {B}', '0'),
        ('Profiles: B updates own profile', 'B', 'update public.profiles set branch = $$EE$$ where id = {B}', '1'),
        ('Profiles: non-IITR user cannot create profile', 'G', 'insert into public.profiles (branch) values ($$ECE$$)', 'ERR:42501'),
        ('Profiles: password session cannot create profile', 'A_pw', 'insert into public.profiles (branch) values ($$ECE$$)', 'ERR:42501'),
        ('Profiles: anon cannot read', 'anon', 'select 1 from public.profiles', 'ERR:42501'),

        -- Conversations
        ('Conversations: A sees only own', 'A', 'select 1 from public.conversations', '1'),
        ('Conversations: A creates own', 'A', 'insert into public.conversations (title) values ($$new$$)', '1'),
        ('Conversations: A cannot create as B', 'A', 'insert into public.conversations (user_id, title) values ({B}, $$x$$)', 'ERR:42501'),
        ('Conversations: A cannot rename B conversation', 'A', 'update public.conversations set title = $$x$$ where id = {cB}', '0'),
        ('Conversations: A cannot hand own conversation to B', 'A', 'update public.conversations set user_id = {B} where id = {cA}', 'ERR:42501'),
        ('Conversations: A cannot delete B conversation', 'A', 'delete from public.conversations where id = {cB}', '0'),
        ('Conversations: A deletes own (cascades)', 'A', 'delete from public.conversations where id = {cA}', '1'),

        -- Chat messages
        ('Messages: A sees only own', 'A', 'select 1 from public.chat_messages', '2'),
        ('Messages: A adds to own conversation', 'A',
         'insert into public.chat_messages (conversation_id, role, content) values ({cA}, $$user$$, $$hello$$)', '1'),
        ('Messages: A cannot add own message to B conversation', 'A',
         'insert into public.chat_messages (conversation_id, role, content) values ({cB}, $$user$$, $$hello$$)', 'ERR:23503'),
        ('Messages: A cannot add message as B', 'A',
         'insert into public.chat_messages (conversation_id, user_id, role, content) values ({cB}, {B}, $$user$$, $$x$$)', 'ERR:42501'),
        ('Messages: cannot be edited', 'A', 'update public.chat_messages set content = $$edited$$ where id = {mAu}', 'ERR:42501'),
        ('Messages: A cannot delete B message', 'A', 'delete from public.chat_messages where id = {mBa}', '0'),
        ('Messages: A deletes own message', 'A', 'delete from public.chat_messages where id = {mAu}', '1'),
        ('Messages: anon cannot insert', 'anon',
         'insert into public.chat_messages (conversation_id, role, content) values ({cA}, $$user$$, $$x$$)', 'ERR:42501'),

        -- Feedback
        ('Feedback: A rates own assistant message', 'A', 'insert into public.message_feedback (message_id, rating) values ({mAa}, 1)', '1'),
        ('Feedback: A cannot rate own user message', 'A', 'insert into public.message_feedback (message_id, rating) values ({mAu}, 1)', 'ERR:42501'),
        ('Feedback: A cannot rate B message', 'A', 'insert into public.message_feedback (message_id, rating) values ({mBa}, 1)', 'ERR:42501'),
        ('Feedback: rating must be -1 or 1', 'A', 'insert into public.message_feedback (message_id, rating) values ({mAa}, 0)', 'ERR:23514'),
        ('Feedback: A cannot see B feedback', 'A', 'select 1 from public.message_feedback', '0'),
        ('Feedback: A cannot change B feedback', 'A', 'update public.message_feedback set rating = -1 where message_id = {mBa}', '0'),
        ('Feedback: B changes own feedback', 'B', 'update public.message_feedback set rating = -1 where message_id = {mBa}', '1'),
        ('Feedback: B cannot move feedback onto A message', 'B',
         'update public.message_feedback set message_id = {mAa} where message_id = {mBa}', 'ERR:42501'),
        ('Feedback: B deletes own feedback', 'B', 'delete from public.message_feedback where message_id = {mBa}', '1')
      )
      select x.idx, x.label, w.role,
             jsonb_strip_nulls(jsonb_build_object('sub', w.sub, 'role', w.role, 'email', w.email,
               'app_metadata', jsonb_build_object('providers', w.providers), 'amr', w.amr)) as claims,
             x.stmt, x.want
      from (select row_number() over () as idx, * from tests) x
      join who w on w.who = x.who
      order by x.idx
    loop
      stmt := t.stmt;
      for k in select jsonb_object_keys(tokens) loop
        stmt := replace(stmt, '{' || k || '}', tokens ->> k);
      end loop;

      begin
        perform set_config('request.jwt.claims', t.claims::text, true);
        execute format('set local role %I', t.role);
        if stmt ~* '^\s*select' then
          execute format('select count(*) from (%s) q', stmt) into cnt;
        else
          execute stmt;
          get diagnostics cnt = row_count;
        end if;
        res := cnt::text;
        raise exception using errcode = 'ZZ001';  -- roll back this test's writes and role
      exception
        when sqlstate 'ZZ001' then null;
        when others then res := 'ERR:' || sqlstate;
      end;

      results := results || jsonb_build_object('n', t.idx, 'test', t.label, 'expected', t.want, 'got', res,
                                               'ok', res = t.want);
    end loop;

    raise exception using errcode = 'ZZ002';  -- roll back the seed
  exception
    when sqlstate 'ZZ002' then null;
  end;

  return query
    select 0, 'SUMMARY'::text, null::text,
           format('%s/%s passed', count(*) filter (where (r ->> 'ok')::boolean), count(*)),
           bool_and((r ->> 'ok')::boolean)
    from jsonb_array_elements(results) r
    union all
    select (r ->> 'n')::int, r ->> 'test', r ->> 'expected', r ->> 'got', (r ->> 'ok')::boolean
    from jsonb_array_elements(results) r
    order by 1;
end;
$fn$;

select * from pg_temp.pathiitr_rls_tests();
