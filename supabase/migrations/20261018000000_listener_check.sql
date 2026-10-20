-- Step A: the listener check. Friends listen to copies of the owner's clips and rate them on a web page.
-- Only the listener-check edge function (server key) and the owner's CLI touch any of this: no policies at all.

-- Copies of chosen recordings, named by clip code (c01.m4a). Separate from `recordings`, so the 30-day cleanup and
-- "Delete all my data" never remove them by accident; each decides about this bucket on purpose.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eval-clips', 'eval-clips', false, 10485760, array['audio/mp4']);

-- One row per friend per clip. Friends are pseudonyms (R1, R2...); names are never stored. R0 is the owner's own test.
create table public.listener_ratings (
  rater text not null check (rater ~ '^R[0-9]$'),
  clip text not null check (clip ~ '^c[0-9]{2}$'),
  point text not null check (length(point) between 1 and 1000),
  -- How much effort it took to follow: 1 = no effort at all ... 5 = hard work.
  effort smallint not null check (effort between 1 and 5),
  has_support boolean not null,
  clear_ending boolean not null,
  would_cut boolean not null,
  stood_out text check (length(stood_out) <= 1000),
  -- Only on the second clip of a pair: which of the two was easier to follow.
  easier text check (easier ~ '^c[0-9]{2}$'),
  rated_at timestamptz not null default now(),
  primary key (rater, clip)
);

alter table public.listener_ratings enable row level security;
