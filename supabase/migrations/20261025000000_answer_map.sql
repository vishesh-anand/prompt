-- Build step C: the Map stage's result (supabase/functions/_shared/schemas/map.ts). In step C it is written only by the
-- map:old script with the owner's login; from step D, process-answer writes it. The phone can read it on its own
-- answers through the table-wide select grant, and can't insert or change it: its insert and update grants name
-- their columns, and this one isn't among them.
alter table public.answers add column map jsonb;
