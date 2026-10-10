-- Checks the step 7 database rules. Run with:
--   npx supabase db query --linked -f supabase/tests/step7.sql
-- One block that always ends in an exception, so Postgres undoes everything it did.
-- Success is an error whose message starts with STEP7_CHECKS_PASSED. Anything starting with FAIL names the broken case.
do $$
declare
  ann uuid := gen_random_uuid();
  ben uuid := gen_random_uuid();
  first_try uuid := gen_random_uuid();
  second_first uuid := gen_random_uuid();
  retry uuid := gen_random_uuid();
  ben_failed uuid := gen_random_uuid();
  ben_next uuid := gen_random_uuid();
  baseline uuid;
  q bigint;
  n integer;
begin
  insert into auth.users (id) values (ann), (ben);
  select id into q from public.questions where active order by id limit 1;
  if q is null then raise exception 'FAIL (setup): no active question'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);

  -- (a) Ann can set her own reminder time and timezone.
  update public.profiles set reminder_time = '20:00', timezone = 'America/New_York' where id = ann;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL (a): own profile update changed % rows', n; end if;

  -- (b) She cannot set her own baseline: only the database does that.
  begin
    update public.profiles set baseline_answer_id = null where id = ann;
    raise exception 'FAIL (b): baseline_answer_id was updated by the phone';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (b): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (c) Her first recording becomes her starting point.
  insert into public.answers (id, question_id, duration_ms) values (first_try, q, 20000);
  select baseline_answer_id into baseline from public.profiles where id = ann;
  if baseline is distinct from first_try then raise exception 'FAIL (c): first answer did not become the baseline (%)', baseline; end if;

  -- (d) A retry and a later first attempt leave it alone.
  insert into public.answers (id, question_id, duration_ms, retry_of) values (retry, q, 20000, first_try);
  insert into public.answers (id, question_id, duration_ms) values (second_first, q, 20000);
  select baseline_answer_id into baseline from public.profiles where id = ann;
  if baseline is distinct from first_try then raise exception 'FAIL (d): baseline moved to %', baseline; end if;

  -- Acts as Ben.
  perform set_config('request.jwt.claims', json_build_object('sub', ben, 'role', 'authenticated')::text, true);

  -- (e) Ben cannot change Ann's profile (his update matches no row).
  update public.profiles set reminder_time = '06:00' where id = ann;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL (e): updated another person''s profile (% rows)', n; end if;

  -- (f) Ben has no baseline until he answers.
  select baseline_answer_id into baseline from public.profiles where id = ben;
  if baseline is not null then raise exception 'FAIL (f): baseline set before any answer'; end if;

  -- (g) The questions: 50 work and 50 everyday active (only checked once the questions migration has run).
  if exists (select 1 from public.questions where text like 'What do you do at work, in a way a friend%') then
    select count(*) into n from public.questions where active and category = 'work';
    if n <> 50 then raise exception 'FAIL (g): % active work questions', n; end if;
    select count(*) into n from public.questions where active and category = 'everyday';
    if n <> 50 then raise exception 'FAIL (g): % active everyday questions', n; end if;
  end if;

  -- (h) A starting point nobody could be heard in is replaced by the next first attempt that has words.
  -- The pipeline (not the phone) writes metrics, so act as the database owner for these updates.
  reset role;
  -- Both rows were inserted in this one transaction and so share a timestamp; make the second one later, as in real life.
  update public.answers set created_at = created_at + interval '1 minute' where id in (second_first, retry);
  update public.answers set metrics = '{"wordCount": 0}'::jsonb where id = first_try;
  update public.answers set metrics = '{"wordCount": 0}'::jsonb where id = second_first;
  select baseline_answer_id into baseline from public.profiles where id = ann;
  if baseline is distinct from first_try then raise exception 'FAIL (h1): an empty second take moved the baseline to %', baseline; end if;

  update public.answers set metrics = '{"wordCount": 45}'::jsonb where id = second_first;
  select baseline_answer_id into baseline from public.profiles where id = ann;
  if baseline is distinct from second_first then raise exception 'FAIL (h2): baseline did not move to the take with words (%)', baseline; end if;

  -- (i) Once the starting point has words, nothing replaces it: not an older take, not a retry.
  update public.answers set metrics = '{"wordCount": 30}'::jsonb where id = first_try;
  update public.answers set metrics = '{"wordCount": 50}'::jsonb where id = retry;
  select baseline_answer_id into baseline from public.profiles where id = ann;
  if baseline is distinct from second_first then raise exception 'FAIL (i): baseline moved to %', baseline; end if;

  -- (j) A starting point that failed for good with no measurements is replaced by the next first attempt that has words,
  -- but one that is still being processed (no metrics, not failed) is not.
  insert into public.answers (id, user_id, question_id, duration_ms) values (ben_failed, ben, q, 20000);
  select baseline_answer_id into baseline from public.profiles where id = ben;
  if baseline is distinct from ben_failed then raise exception 'FAIL (j0): Ben''s first answer is not his baseline (%)', baseline; end if;

  insert into public.answers (id, user_id, question_id, duration_ms, created_at) values (ben_next, ben, q, 20000, now() + interval '1 minute');
  update public.answers set metrics = '{"wordCount": 20}'::jsonb where id = ben_next;
  select baseline_answer_id into baseline from public.profiles where id = ben;
  if baseline is distinct from ben_failed then raise exception 'FAIL (j1): a baseline still being processed was replaced (%)', baseline; end if;

  update public.answers set status = 'failed' where id = ben_failed;
  update public.answers set metrics = '{"wordCount": 21}'::jsonb where id = ben_next;
  select baseline_answer_id into baseline from public.profiles where id = ben;
  if baseline is distinct from ben_next then raise exception 'FAIL (j2): a failed baseline was not replaced (%)', baseline; end if;

  raise exception 'STEP7_CHECKS_PASSED';
end $$;
