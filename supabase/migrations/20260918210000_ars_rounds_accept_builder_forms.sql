-- A form round may now be created empty and built afterwards.
--
-- `ars_rounds_form_has_fields` was written on 2026-09-10, when the only way to
-- give a round its questions was to type them into a textarea while creating it.
-- It refuses a `form` round whose config carries no non-empty `fields` array,
-- which was right then: a round created with no questions was a page asking the
-- student to submit nothing, with no way to fix it afterwards.
--
-- The round builder changed that on 2026-09-18. The intended flow is now: create
-- the round, then open it and compose the form -- pages, sections and a type per
-- question. Under the old constraint that flow is impossible, because the round
-- cannot be created without already having the questions the builder exists to
-- add. The owner met this as a field labelled "optional" that the database then
-- refused.
--
-- So the rule is widened rather than dropped: a `form` round must carry EITHER a
-- non-empty legacy `fields` array, OR a `steps` array, which is what the builder
-- writes. A round with neither is still refused, so the original protection --
-- no form round with nowhere to answer -- survives.
--
-- The empty-section case is deliberately NOT covered here. A form being built
-- legitimately has an empty page, and refusing that in the database would make
-- the builder unusable. What a student may be shown is decided in the
-- application, by `readyForStudents`, and surfaced on the builder as a badge.
--
-- Widening a CHECK can never fail against existing rows, and the deployed code
-- writes only the legacy shape, which the new rule still accepts. Additive in
-- both directions.

begin;

alter table public.ars_rounds
  drop constraint ars_rounds_form_has_fields;

alter table public.ars_rounds
  add constraint ars_rounds_form_has_fields
  check (
    submission_mode <> 'form'
    or (
      (
        jsonb_typeof(config -> 'fields') = 'array'
        and jsonb_array_length(config -> 'fields') > 0
      )
      or (
        jsonb_typeof(config -> 'steps') = 'array'
        and jsonb_array_length(config -> 'steps') > 0
      )
    ) is true
  );

-- `IS TRUE` is not decoration. `config -> 'fields'` is SQL NULL when the key is
-- absent, `jsonb_typeof(NULL)` is NULL, and **a CHECK constraint passes when its
-- expression is NULL**. This exact constraint shipped that bug on 2026-09-10 and
-- accepted the one row it existed to refuse. The collapse to false is what makes
-- it mean what it reads like.

comment on constraint ars_rounds_form_has_fields on public.ars_rounds is
  'A form round must carry questions: either a non-empty legacy fields array or '
  'a steps array written by the round builder. Empty pages and sections inside a '
  'steps form are allowed, because a form being built is a normal state; whether '
  'it may be shown to a student is decided in the application.';

commit;
