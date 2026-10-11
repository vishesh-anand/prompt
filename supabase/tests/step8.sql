-- Checks the step 8 database rules (weekly notes). Run with:
--   npx supabase db query --linked -f supabase/tests/step8.sql
-- One block that always ends in an exception, so Postgres undoes everything it did.
-- Success is an error whose message starts with STEP8_CHECKS_PASSED. Anything starting with FAIL names the broken case.
do $$
declare
  ann uuid := gen_random_uuid();
  ben uuid := gen_random_uuid();
  wk date := date '2026-10-05';
  n integer;
  saved_text text;
  saved_days integer;
begin
  insert into auth.users (id) values (ann), (ben);

  -- The function is for the server key only. Set up as the server role, as the edge function does.
  set local role service_role;

  -- (a) A first note is saved and returned.
  select text, days_covered into saved_text, saved_days from public.save_weekly_note(ann, wk, 'First note.', 3, 1, 'm');
  if saved_text is distinct from 'First note.' or saved_days is distinct from 3 then
    raise exception 'FAIL (a): first note came back as % / %', saved_text, saved_days;
  end if;

  -- (b) A note covering more days replaces it.
  select text, days_covered into saved_text, saved_days from public.save_weekly_note(ann, wk, 'Four days.', 4, 1, 'm');
  if saved_text is distinct from 'Four days.' or saved_days is distinct from 4 then
    raise exception 'FAIL (b): rewrite came back as % / %', saved_text, saved_days;
  end if;

  -- (c) A note covering fewer or the same number of days never replaces it, and the saved one is returned.
  select text, days_covered into saved_text, saved_days from public.save_weekly_note(ann, wk, 'Older.', 3, 1, 'm');
  if saved_text is distinct from 'Four days.' or saved_days is distinct from 4 then
    raise exception 'FAIL (c1): a lower days_covered replaced the note: % / %', saved_text, saved_days;
  end if;
  select text, days_covered into saved_text, saved_days from public.save_weekly_note(ann, wk, 'Same.', 4, 1, 'm');
  if saved_text is distinct from 'Four days.' then raise exception 'FAIL (c2): an equal days_covered replaced the note: %', saved_text; end if;

  -- (d) One row per person per week: that was still one row after three writes.
  select count(*) into n from public.weekly_notes where user_id = ann and week_start = wk;
  if n <> 1 then raise exception 'FAIL (d): % rows for one week', n; end if;

  -- (e) Days covered outside 3 to 7 is refused, so a note never claims a week it can't have.
  begin
    perform public.save_weekly_note(ann, wk + 7, 'Two days.', 2, 1, 'm');
    raise exception 'FAIL (e1): 2 days was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '23514' then raise exception 'FAIL (e1): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    perform public.save_weekly_note(ann, wk + 7, 'Eight days.', 8, 1, 'm');
    raise exception 'FAIL (e2): 8 days was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '23514' then raise exception 'FAIL (e2): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (f) A different week is a different note.
  perform public.save_weekly_note(ann, wk + 7, 'Next week.', 3, 1, 'm');
  select count(*) into n from public.weekly_notes where user_id = ann;
  if n <> 2 then raise exception 'FAIL (f): % notes after two weeks', n; end if;
  perform public.save_weekly_note(ben, wk, 'Ben''s note.', 5, 1, 'm');

  -- Acts as Ann through the phone's login.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);

  -- (g) Ann reads her own notes and only hers.
  select count(*) into n from public.weekly_notes;
  if n <> 2 then raise exception 'FAIL (g): Ann sees % notes, expected her 2', n; end if;

  -- (h) The phone cannot write: not insert, update or delete, and not call the function.
  begin
    insert into public.weekly_notes (user_id, week_start, text, days_covered, prompt_version, model) values (ann, wk + 14, 'x', 3, 1, 'm');
    raise exception 'FAIL (h1): the phone inserted a note';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (h1): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    update public.weekly_notes set text = 'changed' where user_id = ann;
    raise exception 'FAIL (h2): the phone updated a note';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (h2): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    delete from public.weekly_notes where user_id = ann;
    raise exception 'FAIL (h3): the phone deleted a note';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (h3): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    perform public.save_weekly_note(ann, wk + 14, 'x', 3, 1, 'm');
    raise exception 'FAIL (h4): the phone called save_weekly_note';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (h4): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- Acts as Ben.
  perform set_config('request.jwt.claims', json_build_object('sub', ben, 'role', 'authenticated')::text, true);

  -- (i) Ben sees only his own note, never Ann's.
  select count(*) into n from public.weekly_notes;
  if n <> 1 then raise exception 'FAIL (i): Ben sees % notes, expected his 1', n; end if;
  select count(*) into n from public.weekly_notes where user_id = ann;
  if n <> 0 then raise exception 'FAIL (i2): Ben can see Ann''s notes'; end if;

  -- (j) Deleting the account removes the notes.
  reset role;
  delete from auth.users where id = ann;
  select count(*) into n from public.weekly_notes where user_id = ann;
  if n <> 0 then raise exception 'FAIL (j): % notes left after the account was deleted', n; end if;

  raise exception 'STEP8_CHECKS_PASSED';
end $$;
