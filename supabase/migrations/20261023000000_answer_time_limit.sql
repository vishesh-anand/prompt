-- Build step B: answers can be 2 minutes on a first try and 90 seconds on a retry (60 seconds for both before).
-- Each answer keeps the limit it was recorded with, so "time ran out" stays right for old answers too.
-- Existing rows get 60000, which is what they were recorded with. The default stays, because app builds from
-- before step B don't send the column, and they do stop at 60 seconds.

alter table public.answers
  add column time_limit_ms integer not null default 60000;

-- 60 seconds from older builds, otherwise the limit that goes with the kind of answer.
alter table public.answers
  add constraint answers_time_limit_ms_check check (
    time_limit_ms = 60000
    or (retry_of is null and time_limit_ms = 120000)
    or (retry_of is not null and time_limit_ms = 90000)
  );

-- A few seconds of margin over the limit, for the recorder's last moments.
alter table public.answers drop constraint answers_duration_ms_check;
alter table public.answers
  add constraint answers_duration_ms_check check (duration_ms > 0 and duration_ms <= time_limit_ms + 5000);

grant insert (time_limit_ms) on public.answers to authenticated;
