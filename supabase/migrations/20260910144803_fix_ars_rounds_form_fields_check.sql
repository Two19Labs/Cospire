-- Corrects `ars_rounds_form_has_fields`, written minutes earlier in
-- 20260910144415 and wrong in a way that let the exact case it existed to stop
-- through.
--
-- The original read:
--
--   check (
--     submission_mode <> 'form'
--     or (
--       jsonb_typeof(config -> 'fields') = 'array'
--       and jsonb_array_length(config -> 'fields') > 0
--     )
--   )
--
-- A `form` round carrying `{"prompt":"..."}` and no `fields` key at all was
-- accepted. `config -> 'fields'` is SQL NULL when the key is absent, so
-- `jsonb_typeof(NULL)` is NULL, `NULL = 'array'` is NULL, the AND is NULL, and
-- `false or NULL` is NULL -- and **a CHECK constraint passes when its expression
-- is NULL**. Only `false` rejects a row.
--
-- `{"fields": []}` was refused correctly, which is what made the hole easy to
-- miss: the case everyone thinks to test evaluates to a real `false`, and the
-- case nobody types evaluates to NULL.
--
-- Caught by a probe that inserted a `form` round with no fields and expected a
-- refusal. It is recorded here rather than quietly corrected because the trap is
-- general: **every CHECK constraint over a nullable expression needs its NULL
-- case decided on purpose.** `IS TRUE` collapses NULL to false, which is the
-- behaviour a constraint almost always wants.
--
-- Append-only, per operating manual §4.3. 20260910144415 is already applied and
-- recorded, so editing it would leave a file that never runs again and a
-- database that disagrees with it.

begin;

alter table public.ars_rounds
  drop constraint ars_rounds_form_has_fields;

alter table public.ars_rounds
  add constraint ars_rounds_form_has_fields check (
    submission_mode <> 'form'
    or (
      jsonb_typeof(config -> 'fields') = 'array'
      and jsonb_array_length(config -> 'fields') > 0
    ) is true
  );

commit;
