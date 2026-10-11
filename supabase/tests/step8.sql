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
  won boolean;
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

  -- (k) The claim: the first caller wins, and anyone else within the minute is refused.
  select public.claim_weekly_note(ann, wk, 60, 20, 7) into won;
  if won is distinct from true then raise exception 'FAIL (k1): the first claim was refused'; end if;
  select public.claim_weekly_note(ann, wk, 60, 20, 7) into won;
  if won is distinct from false then raise exception 'FAIL (k2): a second claim at once was granted'; end if;

  -- (l) Another week, and another person, have their own claim.
  select public.claim_weekly_note(ann, wk + 7, 60, 20, 7) into won;
  if won is distinct from true then raise exception 'FAIL (l1): next week''s claim was refused'; end if;
  select public.claim_weekly_note(ben, wk, 60, 20, 7) into won;
  if won is distinct from true then raise exception 'FAIL (l2): another person''s claim was refused'; end if;

  -- (m) A claim older than a minute can be taken again (a call that crashed doesn't block the week), and a younger one can't.
  update public.weekly_note_claims set claimed_at = now() - interval '30 seconds' where user_id = ann and week_start = wk;
  select public.claim_weekly_note(ann, wk, 60, 20, 7) into won;
  if won is distinct from false then raise exception 'FAIL (m1): a 30-second-old claim was taken again'; end if;
  update public.weekly_note_claims set claimed_at = now() - interval '2 minutes' where user_id = ann and week_start = wk;
  select public.claim_weekly_note(ann, wk, 60, 20, 7) into won;
  if won is distinct from true then raise exception 'FAIL (m2): a 2-minute-old claim was not released'; end if;
  select public.claim_weekly_note(ann, wk, 60, 20, 7) into won;
  if won is distinct from false then raise exception 'FAIL (m3): the re-taken claim was granted twice'; end if;

  -- (o) The bound is checked: nothing, or hours, is refused.
  begin
    perform public.claim_weekly_note(ann, wk + 28, 0, 20, 7);
    raise exception 'FAIL (o1): a bound of 0 seconds was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like '%p_min_seconds must be between%' then raise exception 'FAIL (o1): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    perform public.claim_weekly_note(ann, wk + 28, 100000, 20, 7);
    raise exception 'FAIL (o2): a bound of a day was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like '%p_min_seconds must be between%' then raise exception 'FAIL (o2): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (p) The caller's bound is what is used: a 30-second-old claim is refused at 60 seconds and granted at 10.
  update public.weekly_note_claims set claimed_at = now() - interval '30 seconds' where user_id = ann and week_start = wk;
  select public.claim_weekly_note(ann, wk, 60, 20, 7) into won;
  if won is distinct from false then raise exception 'FAIL (p1): a 30-second-old claim was taken with a 60-second bound'; end if;
  select public.claim_weekly_note(ann, wk, 10, 20, 7) into won;
  if won is distinct from true then raise exception 'FAIL (p2): a 30-second-old claim was refused with a 10-second bound'; end if;

  -- (q) Claims from weeks that ended more than two weeks ago are removed as a new one is written, and only this person's.
  insert into public.weekly_note_claims (user_id, week_start) values (ann, wk - 60), (ben, wk - 60);
  perform public.claim_weekly_note(ann, wk, 60, 20, 7);
  select count(*) into n from public.weekly_note_claims where user_id = ann and week_start = wk - 60;
  if n <> 0 then raise exception 'FAIL (q1): an old claim of Ann''s was not removed'; end if;
  select count(*) into n from public.weekly_note_claims where user_id = ben and week_start = wk - 60;
  if n <> 1 then raise exception 'FAIL (q2): another person''s old claim was removed'; end if;

  -- (r) Attempts per week are capped: with a cap of 3, the 4th attempt is refused even after the minute has passed.
  select public.claim_weekly_note(ben, wk + 35, 60, 3, 7) into won;
  if won is distinct from true then raise exception 'FAIL (r1): the first attempt was refused'; end if;
  update public.weekly_note_claims set claimed_at = now() - interval '2 minutes' where user_id = ben and week_start = wk + 35;
  select public.claim_weekly_note(ben, wk + 35, 60, 3, 7) into won;
  update public.weekly_note_claims set claimed_at = now() - interval '2 minutes' where user_id = ben and week_start = wk + 35;
  select public.claim_weekly_note(ben, wk + 35, 60, 3, 7) into won;
  if won is distinct from true then raise exception 'FAIL (r2): the third attempt was refused'; end if;
  update public.weekly_note_claims set claimed_at = now() - interval '2 minutes' where user_id = ben and week_start = wk + 35;
  select public.claim_weekly_note(ben, wk + 35, 60, 3, 7) into won;
  if won is distinct from false then raise exception 'FAIL (r3): a fourth attempt went past the cap of 3'; end if;
  select attempts into n from public.weekly_note_claims where user_id = ben and week_start = wk + 35;
  if n <> 3 then raise exception 'FAIL (r4): attempts is %, expected 3', n; end if;
  -- A new week starts with a fresh count.
  select public.claim_weekly_note(ben, wk + 42, 60, 3, 7) into won;
  if won is distinct from true then raise exception 'FAIL (r5): the next week did not start fresh'; end if;

  -- (t) A note that was written starts the attempt count again; a refused (lower or equal) save does not.
  select public.claim_weekly_note(ann, wk + 56, 60, 3, 7) into won;
  update public.weekly_note_claims set claimed_at = now() - interval '2 minutes' where user_id = ann and week_start = wk + 56;
  select public.claim_weekly_note(ann, wk + 56, 60, 3, 7) into won;
  select attempts into n from public.weekly_note_claims where user_id = ann and week_start = wk + 56;
  if n <> 2 then raise exception 'FAIL (t1): attempts is %, expected 2', n; end if;
  perform public.save_weekly_note(ann, wk + 56, 'Saved.', 3, 1, 'm');
  select attempts into n from public.weekly_note_claims where user_id = ann and week_start = wk + 56;
  if n <> 0 then raise exception 'FAIL (t2): a saved note left attempts at %', n; end if;
  update public.weekly_note_claims set attempts = 2 where user_id = ann and week_start = wk + 56;
  perform public.save_weekly_note(ann, wk + 56, 'Not newer.', 3, 1, 'm');
  select attempts into n from public.weekly_note_claims where user_id = ann and week_start = wk + 56;
  if n <> 2 then raise exception 'FAIL (t3): a refused save reset attempts to %', n; end if;

  -- (u) A saved note that already covers the days needs no claim: the claim is refused and no attempt is used.
  perform public.save_weekly_note(ben, wk + 63, 'Four days.', 4, 1, 'm');
  select public.claim_weekly_note(ben, wk + 63, 60, 20, 4) into won;
  if won is distinct from false then raise exception 'FAIL (u1): claimed a week whose note already covers the days'; end if;
  select public.claim_weekly_note(ben, wk + 63, 60, 20, 3) into won;
  if won is distinct from false then raise exception 'FAIL (u2): claimed for fewer days than the note covers'; end if;
  select count(*) into n from public.weekly_note_claims where user_id = ben and week_start = wk + 63;
  if n <> 0 then raise exception 'FAIL (u3): a refused claim left a claim row'; end if;
  select public.claim_weekly_note(ben, wk + 63, 60, 20, 5) into won;
  if won is distinct from true then raise exception 'FAIL (u4): a note for more days was refused'; end if;

  -- (v) The days are checked.
  begin
    perform public.claim_weekly_note(ann, wk + 70, 60, 20, 0);
    raise exception 'FAIL (v1): 0 days was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like '%p_days_covered must be between 3 and 7%' then raise exception 'FAIL (v1): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    perform public.claim_weekly_note(ann, wk + 70, 60, 20, 8);
    raise exception 'FAIL (v2): 8 days was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like '%p_days_covered must be between 3 and 7%' then raise exception 'FAIL (v2): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (w) Attempts start again after 6 hours: at the cap and 5 hours old the claim is refused; at 7 hours it is granted
  -- and counts as the first attempt again.
  insert into public.weekly_note_claims (user_id, week_start, claimed_at, attempts) values (ann, wk + 77, now() - interval '5 hours', 3);
  select public.claim_weekly_note(ann, wk + 77, 60, 3, 3) into won;
  if won is distinct from false then raise exception 'FAIL (w1): a claim at the cap, 5 hours old, was granted'; end if;
  update public.weekly_note_claims set claimed_at = now() - interval '7 hours' where user_id = ann and week_start = wk + 77;
  select public.claim_weekly_note(ann, wk + 77, 60, 3, 3) into won;
  if won is distinct from true then raise exception 'FAIL (w2): a claim at the cap, 7 hours old, was refused'; end if;
  select attempts into n from public.weekly_note_claims where user_id = ann and week_start = wk + 77;
  if n <> 1 then raise exception 'FAIL (w3): attempts after the decay is %, expected 1', n; end if;

  -- (s) The cap is checked too.
  begin
    perform public.claim_weekly_note(ann, wk + 49, 60, 0, 7);
    raise exception 'FAIL (s1): a cap of 0 was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like '%p_max_attempts must be between%' then raise exception 'FAIL (s1): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- Acts as Ann through the phone's login.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ann, 'role', 'authenticated')::text, true);

  -- (g) Ann reads her own notes and only hers.
  select count(*) into n from public.weekly_notes;
  -- Her notes: this week, next week, and the one saved in (t).
  if n <> 3 then raise exception 'FAIL (g): Ann sees % notes, expected her 3', n; end if;

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

  -- (n) The phone cannot call the claim or read the claims.
  begin
    perform public.claim_weekly_note(ann, wk + 21, 60, 20, 7);
    raise exception 'FAIL (n1): the phone called claim_weekly_note';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (n1): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    perform 1 from public.weekly_note_claims;
    raise exception 'FAIL (n2): the phone read the claims';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (n2): wrong error: % %', sqlstate, sqlerrm; end if;
  end;

  -- (n3) Signed-out visitors (anon) cannot call claim_weekly_note or save_weekly_note, or read weekly_notes or weekly_note_claims.
  set local role anon;
  begin
    perform public.claim_weekly_note(ann, wk + 21, 60, 20, 4);
    raise exception 'FAIL (n3): anon called claim_weekly_note';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (n3): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    perform public.save_weekly_note(ann, wk + 21, 'x', 3, 1, 'm');
    raise exception 'FAIL (n4): anon called save_weekly_note';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (n4): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    perform 1 from public.weekly_notes;
    raise exception 'FAIL (n5): anon read weekly_notes';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (n5): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    perform 1 from public.weekly_note_claims;
    raise exception 'FAIL (n6): anon read weekly_note_claims';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FAIL (n6): wrong error: % %', sqlstate, sqlerrm; end if;
  end;
  set local role authenticated;

  -- Acts as Ben.
  perform set_config('request.jwt.claims', json_build_object('sub', ben, 'role', 'authenticated')::text, true);

  -- (i) Ben sees only his own note, never Ann's.
  select count(*) into n from public.weekly_notes;
  -- His notes: this week, and the one saved in (u).
  if n <> 2 then raise exception 'FAIL (i): Ben sees % notes, expected his 2', n; end if;
  select count(*) into n from public.weekly_notes where user_id = ann;
  if n <> 0 then raise exception 'FAIL (i2): Ben can see Ann''s notes'; end if;

  -- (j) Deleting the account removes the notes.
  reset role;
  delete from auth.users where id = ann;
  select count(*) into n from public.weekly_notes where user_id = ann;
  if n <> 0 then raise exception 'FAIL (j): % notes left after the account was deleted', n; end if;
  select count(*) into n from public.weekly_note_claims where user_id = ann;
  if n <> 0 then raise exception 'FAIL (j2): % claims left after the account was deleted', n; end if;

  raise exception 'STEP8_CHECKS_PASSED';
end $$;
