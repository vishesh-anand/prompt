-- The notebook only moves forward: it remembers the time of the newest answer it has absorbed, so an older
-- answer (a late retry, or two answers processed at once) can never overwrite a notebook that has moved past it.
-- Null means "no answer recorded yet", for a notebook written before this column existed.
alter table public.coach_notebooks add column last_answer_at timestamptz;
