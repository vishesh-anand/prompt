-- Checks build step D, part 1: the new mapped status, and the questions' direct-answer flag. Run with:
--   npx supabase db query --linked -f supabase/tests/stepD.sql
-- It is one block that always ends in an exception, so Postgres undoes everything it did.
-- Success looks like an error whose message starts with STEPD_CHECKS_PASSED.
-- Any other message names the case that failed, starting with FAIL.
do $$
declare
  ann uuid := gen_random_uuid();
  anns_answer uuid := gen_random_uuid();
  flagged integer;
  rows_changed integer;
begin
  insert into auth.users (id) values (ann);
  insert into public.answers (id, user_id, question_id, duration_ms) values (anns_answer, ann, 1, 30000);

  -- (a) As the server: an answer can be mapped, and an unknown status is still refused.
  update public.answers set status = 'mapped' where id = anns_answer;
  begin
    update public.answers set status = 'mapping' where id = anns_answer;
    raise exception 'FAIL (a): an unknown status was saved';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '23514' then raise exception 'FAIL (a): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (b) The active questions that want a direct answer: 57 of the 100 in content/questions.json.
  select count(*) into flagged from public.questions where active and wants_direct_answer;
  if flagged <> 57 then raise exception 'FAIL (b): % active questions want a direct answer, not 57', flagged; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);

  -- (c) Ann reads the flag.
  select count(*) into flagged from public.questions where wants_direct_answer;
  if flagged = 0 then raise exception 'FAIL (c): Ann can''t read the flag'; end if;

  -- (d) Ann can't change a question: no update grant, so a refusal, or no row changed.
  begin
    update public.questions set wants_direct_answer = false where wants_direct_answer;
    get diagnostics rows_changed = row_count;
    if rows_changed <> 0 then raise exception 'FAIL (d): Ann changed % questions', rows_changed; end if;
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (d): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (e) Ann can't set her own answer's status to mapped (the pipeline does that).
  begin
    update public.answers set status = 'mapped' where id = anns_answer;
    raise exception 'FAIL (e): Ann changed her answer''s status';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (e): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  raise exception 'STEPD_CHECKS_PASSED';
end $$;
