-- The Client's feedback board (owner, 2026-11-11): a title, a thought, an
-- urgent flag and optional screenshots, logged from a secret link with no
-- login; the owner answers each one and sets a status from a second secret link.
--
-- Nobody is signed in on those pages, so no policy can describe who may read or
-- write here. The table and the bucket therefore have **no policies at all**:
-- RLS is on and forced, `anon` and `authenticated` hold no grants, and the only
-- way in is the server (`src/features/feedback/store.ts`), after it has checked
-- the link's code. It holds no student data and references no other table.
--
-- Additive: one new table, one new private bucket.

begin;

create table public.feedback_thoughts (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  urgent boolean not null default false,
  author_name text check (author_name is null or char_length(author_name) between 1 and 80),
  screenshots text[] not null default '{}' check (cardinality(screenshots) <= 5),
  status text not null default 'new'
    check (status in ('new', 'discussing', 'planned', 'done', 'out_of_scope')),
  reply text check (reply is null or char_length(reply) <= 5000),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index feedback_thoughts_created_at_idx on public.feedback_thoughts (created_at desc);

alter table public.feedback_thoughts enable row level security;
alter table public.feedback_thoughts force row level security;
revoke all on table public.feedback_thoughts from public, anon, authenticated;

-- Screenshots: private, images only, 5 MB each. No policy on storage.objects
-- names this bucket, so only the server's signed URLs reach it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback',
  'feedback',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

commit;
