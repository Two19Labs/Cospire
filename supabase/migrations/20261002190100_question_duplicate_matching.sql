-- Phase 6.3: recognising a question the bank already holds (decisions D22-D24).
--
-- Cospire works from their own documents and never holds our question ids, so
-- when the same question arrives again in another paper the platform has to
-- recognise it. No model is involved (D22). Two signals, both computed here:
--
--   1. A normalised text key per question. Case, spacing and punctuation are
--      ignored; letters, digits, decimal points inside numbers and maths
--      symbols are kept, so "7.2" never equals "72" and "= 4" never equals
--      "= 5". Equal keys are the first condition of an exact match; the
--      application then compares type, options in order, the key and the
--      pictures before it links anything (D24, O3).
--   2. Trigram similarity (`pg_trgm`) between keys, which only ever SUGGESTS a
--      match for a person to decide. Nothing links on similarity alone.
--
-- `find_question_matches` compares a paper's questions with the bank and with
-- each other, so a question repeated inside one paper is caught too.
--
-- `approve_question_import_into` is the "corrected version" choice: it updates
-- an existing question with the reviewed fields and marks the staged row
-- approved against it, in one transaction. A changed key, option set or type
-- rescores past attempts through the existing triggers, as any edit does.
--
-- "Same question" needs no function: the admin's existing grant on
-- `question_imports (status, question_id)` already lets a pending row be
-- approved against an existing question, and the guard allows exactly that.
--
-- Additive: an extension, one immutable function, one generated column, two
-- indexes, two functions. Nothing dropped or renamed.

begin;

create extension if not exists pg_trgm with schema extensions;

create or replace function private.question_text_key(p_body text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      -- A full stop or comma that is not inside a number is punctuation.
      regexp_replace(lower(coalesce(p_body, '')), '(?<![0-9])[.,]|[.,](?![0-9])', ' ', 'g'),
      '[^[:alnum:].,+*/=<>%^√π²³×÷≤≥−-]+', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

revoke execute on function private.question_text_key(text) from public, anon;
grant execute on function private.question_text_key(text) to authenticated;

alter table public.questions
  add column body_key text generated always as (private.question_text_key(body)) stored;

-- Equality goes through a hash, because a btree entry is capped near 2.7 kB and
-- a passage can be longer than that.
create index questions_body_key_hash_idx on public.questions (org_id, md5(body_key));
create index questions_body_key_trgm_idx on public.questions using gin (body_key extensions.gin_trgm_ops);

-- One row per suggestion. `match_kind` is 'bank' (match_ref is a question id)
-- or 'paper' (match_ref is the index of an earlier entry in p_bodies). Inputs
-- are numbered from 0, in the order given.
--
-- SECURITY INVOKER, so RLS decides which bank questions a caller can be shown:
-- an admin or mentor sees their own organisation's, nobody else's.
create or replace function public.find_question_matches(
  p_bodies text[],
  p_threshold real default 0.5
)
returns table (
  input_index integer,
  match_kind text,
  match_ref bigint,
  similarity real,
  same_text boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select (t.ord - 1)::integer as input_index,
           private.question_text_key(t.body) as body_key
      from unnest(p_bodies) with ordinality as t(body, ord)
  )
  select i.input_index, 'bank'::text, m.id, m.score, m.same_text
    from input as i
    cross join lateral (
      select q.id,
             extensions.similarity(q.body_key, i.body_key) as score,
             q.body_key = i.body_key as same_text
        from public.questions as q
       where q.archived_at is null
         and (
           md5(q.body_key) = md5(i.body_key)
           or q.body_key operator(extensions.%) i.body_key
         )
       order by (q.body_key = i.body_key) desc, extensions.similarity(q.body_key, i.body_key) desc, q.id
       limit 3
    ) as m
   where i.body_key <> ''
     and (m.same_text or m.score >= p_threshold)
  union all
  select later.input_index, 'paper'::text, earlier.input_index::bigint,
         extensions.similarity(earlier.body_key, later.body_key),
         earlier.body_key = later.body_key
    from input as later
    join input as earlier on earlier.input_index < later.input_index
   where later.body_key <> ''
     and (
       earlier.body_key = later.body_key
       or extensions.similarity(earlier.body_key, later.body_key) >= p_threshold
     )
$$;

revoke execute on function public.find_question_matches(text[], real) from public, anon;
grant execute on function public.find_question_matches(text[], real) to authenticated;

-- "Corrected version": the staged question replaces the content of an existing
-- one. Same arguments as approve_question_import, plus the question to update.
-- save_question enforces that the caller may edit it; the staging update below
-- enforces that the row is still pending. Either failing rolls both back.
create or replace function public.approve_question_import_into(
  p_import_id bigint,
  p_question_id bigint,
  p_type text,
  p_body text,
  p_options jsonb,
  p_images jsonb,
  p_parent_id bigint,
  p_section_id bigint,
  p_topic text,
  p_difficulty text,
  p_marks numeric,
  p_correct_answer jsonb,
  p_solution text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id bigint;
  decided_id bigint;
begin
  if p_question_id is null then
    raise exception 'a corrected version must name the question it corrects' using errcode = '22023';
  end if;

  saved_id := public.save_question(
    p_question_id, p_type, p_body, p_options, p_images, p_parent_id,
    p_section_id, p_topic, p_difficulty, p_marks, p_correct_answer, p_solution
  );

  update public.question_imports
     set status = 'approved',
         question_id = saved_id
   where id = p_import_id
     and status = 'pending_review'
  returning id into decided_id;

  if decided_id is null then
    raise exception 'import % is not awaiting review', p_import_id using errcode = 'P0002';
  end if;

  return saved_id;
end;
$$;

revoke execute on function public.approve_question_import_into(
  bigint, bigint, text, text, jsonb, jsonb, bigint, bigint, text, text, numeric, jsonb, text
) from public, anon;
grant execute on function public.approve_question_import_into(
  bigint, bigint, text, text, jsonb, jsonb, bigint, bigint, text, text, numeric, jsonb, text
) to authenticated;

commit;
