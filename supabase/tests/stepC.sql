-- Checks the map column from build step C: the phone reads its own map, never anyone else's, and can't write one. Run with:
--   npx supabase db query --linked -f supabase/tests/stepC.sql
-- It is one block that always ends in an exception, so Postgres undoes everything it did.
-- Success looks like an error whose message starts with STEPC_CHECKS_PASSED.
-- Any other message names the case that failed, starting with FAIL.
do $$
declare
  ann uuid := gen_random_uuid();
  bob uuid := gen_random_uuid();
  anns_answer uuid := gen_random_uuid();
  bobs_answer uuid := gen_random_uuid();
  seen jsonb;
  rows_seen integer;
begin
  insert into auth.users (id) values (ann), (bob);
  -- As the server: each has an answer with a map.
  insert into public.answers (id, user_id, question_id, duration_ms, map)
    values (anns_answer, ann, 1, 30000, '{"effort": 2}'), (bobs_answer, bob, 1, 30000, '{"effort": 4}');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);

  -- (a) Ann reads her own map.
  select map into seen from public.answers where id = anns_answer;
  if seen is distinct from '{"effort": 2}'::jsonb then raise exception 'FAIL (a): Ann read % as her own map', seen; end if;

  -- (b) Ann can't see Bob's answer at all.
  select count(*) into rows_seen from public.answers where id = bobs_answer;
  if rows_seen <> 0 then raise exception 'FAIL (b): Ann can see Bob''s answer'; end if;

  -- (c) Ann can't change her map.
  begin
    update public.answers set map = '{"effort": 1}' where id = anns_answer;
    raise exception 'FAIL (c): Ann changed her own map';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (c): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (d) Ann can't add an answer that comes with a map.
  begin
    insert into public.answers (question_id, duration_ms, map) values (1, 30000, '{"effort": 1}');
    raise exception 'FAIL (d): Ann added an answer with a map';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (d): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  raise exception 'STEPC_CHECKS_PASSED';
end $$;
