-- Checks build step D, part 2: the listener_confirmed column. Run with:
--   npx supabase db query --remote -f supabase/tests/stepD2.sql
-- It is one block that always ends in an exception, so Postgres undoes everything it did.
-- Success looks like an error whose message starts with STEPD2_CHECKS_PASSED.
-- Any other message names the case that failed, starting with FAIL.
do $$
declare
  ann uuid := gen_random_uuid();
  bob uuid := gen_random_uuid();
  anns_answer uuid := gen_random_uuid();
  bobs_answer uuid := gen_random_uuid();
  confirmed boolean;
  flagged boolean;
  rows_changed integer;
begin
  insert into auth.users (id) values (ann), (bob);
  insert into public.answers (id, user_id, question_id, duration_ms) values (anns_answer, ann, 1, 30000), (bobs_answer, bob, 1, 30000);

  -- (a) A new answer starts with nothing tapped.
  select listener_confirmed into confirmed from public.answers where id = anns_answer;
  if confirmed is not null then raise exception 'FAIL (a): a new answer has listener_confirmed = %', confirmed; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);

  -- (b) Ann taps "That's what I meant", then "Not quite", then taps it again to undo.
  update public.answers set listener_confirmed = true where id = anns_answer;
  select listener_confirmed into confirmed from public.answers where id = anns_answer;
  if confirmed is distinct from true then raise exception 'FAIL (b): after "That''s what I meant" it is %', confirmed; end if;
  update public.answers set listener_confirmed = false where id = anns_answer;
  select listener_confirmed into confirmed from public.answers where id = anns_answer;
  if confirmed is distinct from false then raise exception 'FAIL (b): after "Not quite" it is %', confirmed; end if;
  update public.answers set listener_confirmed = null where id = anns_answer;
  select listener_confirmed into confirmed from public.answers where id = anns_answer;
  if confirmed is not null then raise exception 'FAIL (b): after undo it is %', confirmed; end if;

  -- (c) "This feedback is wrong" still works.
  update public.answers set feedback_flagged = true where id = anns_answer;
  select feedback_flagged into flagged from public.answers where id = anns_answer;
  if flagged is distinct from true then raise exception 'FAIL (c): Ann can''t flag her answer any more'; end if;

  -- (d) Ann can't tap on Bob's answer: the policy hides his row, so nothing changes.
  update public.answers set listener_confirmed = true where id = bobs_answer;
  get diagnostics rows_changed = row_count;
  if rows_changed <> 0 then raise exception 'FAIL (d): Ann changed Bob''s answer'; end if;

  -- (e) Ann still can't change any other column of her own answer.
  begin
    update public.answers set coaching = '{}'::jsonb where id = anns_answer;
    raise exception 'FAIL (e): Ann changed her answer''s coaching';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (e): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (f) Signed out, nobody can set it.
  reset role;
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    update public.answers set listener_confirmed = true where id = anns_answer;
    get diagnostics rows_changed = row_count;
    if rows_changed <> 0 then raise exception 'FAIL (f): a signed-out visitor changed an answer'; end if;
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (f): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (g) Bob's answer is untouched (read as the server).
  reset role;
  select listener_confirmed into confirmed from public.answers where id = bobs_answer;
  if confirmed is not null then raise exception 'FAIL (g): Bob''s answer has listener_confirmed = %', confirmed; end if;

  raise exception 'STEPD2_CHECKS_PASSED';
end $$;
