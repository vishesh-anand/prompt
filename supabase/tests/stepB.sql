-- Checks the answer lengths from build step B: 2 minutes on a first try, 90 seconds on a retry, 60 seconds from older
-- app builds that don't send time_limit_ms. Run with:
--   npx supabase db query --linked -f supabase/tests/stepB.sql
-- It is one block that always ends in an exception, so Postgres undoes everything it did.
-- Success looks like an error whose message starts with STEPB_CHECKS_PASSED.
-- Any other message names the case that failed, starting with FAIL.
do $$
declare
  ann uuid := gen_random_uuid();
  first_try uuid := gen_random_uuid();
  old_build uuid := gen_random_uuid();
  saved integer;
begin
  insert into auth.users (id) values (ann);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);

  -- (a) A full 2-minute first try, plus the margin, is accepted.
  begin
    insert into public.answers (id, question_id, duration_ms, time_limit_ms) values (first_try, 1, 125000, 120000);
  exception when others then
    raise exception 'FAIL (a): a 2-minute first try was refused: % %', sqlstate, sqlerrm;
  end;

  -- (b) Longer than the limit and its margin is refused.
  begin
    insert into public.answers (question_id, duration_ms, time_limit_ms) values (1, 126000, 120000);
    raise exception 'FAIL (b): a 2:06 first try was allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '23514' then raise exception 'FAIL (b): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (c) A 95-second retry is accepted, a 96-second one refused.
  begin
    insert into public.answers (question_id, duration_ms, time_limit_ms, retry_of) values (1, 95000, 90000, first_try);
  exception when others then
    raise exception 'FAIL (c): a 95-second retry was refused: % %', sqlstate, sqlerrm;
  end;
  begin
    insert into public.answers (question_id, duration_ms, time_limit_ms, retry_of) values (1, 96000, 90000, first_try);
    raise exception 'FAIL (c): a 96-second retry was allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '23514' then raise exception 'FAIL (c): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (d) A limit that doesn't go with the kind of answer, or isn't a known one, is refused.
  begin
    insert into public.answers (question_id, duration_ms, time_limit_ms, retry_of) values (1, 20000, 120000, first_try);
    raise exception 'FAIL (d): a retry with the 2-minute limit was allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '23514' then raise exception 'FAIL (d): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    insert into public.answers (question_id, duration_ms, time_limit_ms) values (1, 20000, 90000);
    raise exception 'FAIL (d): a first try with the 90-second limit was allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '23514' then raise exception 'FAIL (d): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    insert into public.answers (question_id, duration_ms, time_limit_ms) values (1, 20000, 600000);
    raise exception 'FAIL (d): an unknown limit was allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '23514' then raise exception 'FAIL (d): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (e) An older build sends no limit: it gets 60 seconds, and can't go past 65.
  insert into public.answers (id, question_id, duration_ms) values (old_build, 1, 60000);
  select time_limit_ms into saved from public.answers where id = old_build;
  if saved is distinct from 60000 then raise exception 'FAIL (e): an old-build answer got % instead of 60000', saved; end if;
  begin
    insert into public.answers (question_id, duration_ms) values (1, 66000);
    raise exception 'FAIL (e): a 66-second answer from an old build was allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '23514' then raise exception 'FAIL (e): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (f) The phone can't change the limit afterwards.
  begin
    update public.answers set time_limit_ms = 120000 where id = old_build;
    raise exception 'FAIL (f): the limit was changed after the answer was added';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (f): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  raise exception 'STEPB_CHECKS_PASSED';
end $$;
