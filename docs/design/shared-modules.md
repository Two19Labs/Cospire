# Design: programmes built from shared modules

Status: **proposed, for the owner to agree.** No code or migration yet.
Decision: D61 (owner, 2026-11-11). Inputs: *The programmes call, 2026-11-11* and
*The Client's written topic flow, 2026-11-12* in `docs/context/meetings.md`.

## Shape

```
programme (courses, kind = 'programme')
  ├─ subject (sections, kind = 'subject')         QA, LR, DI, VA ...
  │    ├─ ordered modules (section_modules)       Time and Work, Percentages (tough) ...
  │    │    └─ ordered items (curriculum_items)    video, document, test, text
  │    └─ subject-level items (curriculum_items)   subject tests
  └─ mocks (sections, kind = 'mocks')             full mocks, shown separately
```

A module is built once and attached to any number of subjects in any number of
programmes. A variation (easy / tough, institute-specific) is simply another
module. Items inside a module keep today's mixed-item shape (manual §4.1).

## 1. Tables

All changes are additive, expand-and-contract. The deployed curriculum code keeps
working until the screens move over; nothing is dropped in the first migration.

**New: `modules`**

| column | type | notes |
|---|---|---|
| id | bigint identity PK | `unique (id, org_id)` for composite FKs |
| org_id | bigint not null | |
| title | text not null | same blank / length / trim checks as `sections.title` |
| created_at, updated_at | timestamptz | `private.set_updated_at` trigger |

No subject, difficulty or tag column: the title carries "Profit and Loss (tough)".
Deferred until a library of ~100 modules proves it needs filtering.

**New: `section_modules`** (a module attached to a subject, ordered)

| column | type | notes |
|---|---|---|
| section_id | bigint | FK `(section_id, org_id)` -> `sections`, on delete cascade |
| module_id | bigint | FK `(module_id, org_id)` -> `modules`, on delete **restrict** |
| org_id | bigint not null | keeps both ends in one organisation |
| sort_order | integer not null default 0 | ties break on module_id |
| PK | (section_id, module_id) | a module appears once per subject |

Index `(module_id)` for the access lookup. Restrict on module delete: the admin
detaches it first (the module page lists where it is used).

**Changed: `curriculum_items`** gains `module_id bigint null`, FK
`(module_id, org_id)` -> `modules`, on delete cascade. `section_id` becomes
nullable, with `check (num_nonnulls(section_id, module_id) = 1)`: an item lives in
exactly one module, or directly in a subject (a subject test) or the mocks
section. Index `(module_id, sort_order, id)`. Every existing row has
`section_id`, so the check holds on day one.

**Changed: `sections`** is the subject. Kept, not replaced; gains
`kind text not null default 'subject' check (kind in ('subject', 'mocks'))`. A
programme's full mocks are test items in its single `mocks` section (partial
unique index on `(course_id) where kind = 'mocks'`).

**Changed: `item_progress`** and **`attempts`**: see section 3.

**RLS.** Enabled and forced in the creating migration; every helper `STABLE
SECURITY DEFINER`, `search_path = ''`, `(select auth.uid())`, execute granted to
`authenticated` only.

- `modules`: SELECT / INSERT / UPDATE / DELETE for `is_admin_of_org(org_id)`;
  student SELECT when `org_id = current_org_id()` and `student_reaches_module(id)`.
- `section_modules`: admin all four verbs; student SELECT when
  `student_reaches_section(section_id)`. No student writes anywhere.
- `curriculum_items` SELECT gains one OR branch:
  `module_id is not null and student_reaches_module(module_id)`. Write policies
  unchanged (admin only).
- New helper `private.student_reaches_module(module_id)`: a `section_modules` row
  exists whose section passes `student_reaches_section`.
- Triggers: `section_modules` refuses a `mocks` section; a `mocks` section holds
  only test items; the existing org and `kind = 'programme'` checks stay.

## 2. Access rule

Unchanged in principle: a `content_access` row with `resource_type = 'course'` on
a programme opens everything in it (N11). Only
`private.student_has_programme_item(type, ref_id)` changes: it matches an item
reached **either** `item -> section -> course` (today) **or**
`item -> module -> section_modules -> section -> course`. Because
`student_has_document_grant`, `student_has_mock_grant` and the video OTP check
already route through it, documents, mocks, attempts and videos follow with no
other policy rewritten.

A module shared by MU and Ashoka: a student holding either grant reaches its
items; holding neither, nothing. Revoking MU leaves the Ashoka path intact.
Individual grants keep working as overrides. No per-module grant (deferred:
nobody has asked to grant a module on its own).

The topic PDF is a document item in the existing view-only viewer (no download).
Nothing new.

## 3. Per-programme progress

`item_progress` gains `course_id bigint`, FK `(course_id, org_id)` -> `courses`.
One migration per step:

1. Add `course_id` nullable; backfill from `item -> section -> course`
   (**0 rows today**); set not null.
2. Swap the PK to `(student_id, course_id, item_id)`.
3. `student_may_record_progress(item_id, course_id, org_id)`: the item must be
   reachable *through that course* and the student must hold the course. The old
   overload stays until `record-progress.ts` passes `course_id`, then is dropped
   (the contract step).

Test items: completion stays derived from `attempts`, never stored. To make it
per programme, `attempts` gains `course_id bigint null`, set by the server when an
attempt starts from a programme page (from the URL, checked against the grant;
never trusted from the client as-is). A test item counts as done in programme P
only for a submitted attempt with `course_id = P`. An attempt started outside a
programme carries null. See open question 1.

## 4. Tests at three levels

All three are existing **mocks** placed as `type = 'test'` curriculum items. No
new practice-set or quiz table: the 2026-11-12 flow maps onto what exists.

| level | where the item sits | mock settings |
|---|---|---|
| Topic test (module) | `curriculum_items.module_id` | `proctoring_enabled = false`, short or untimed |
| Subject test | a subject section's `section_id` | admin's choice |
| Full mock (programme) | the programme's `mocks` section | as today |

`attempts.proctored` and `allow_mobile` behave exactly as now (manual §1.5).
Attempt limits stay per mock, so a quiz shared by two programmes shares its
`max_attempts` (open question 2).

## 5. Screens

**Admin**

- **Module library** (`/admin/modules`): paginated, title search, "used in"
  count. Module page = today's curriculum builder pointed at `module_id` (add
  video / document / test / text, reorder, remove), plus where it is used.
- **Duplicate module** (to start a variation): one server action copying the row
  and its items. Cheap, and it is how variations will actually be made.
- **Programme page**: subjects (today's sections, relabelled), each with ordered
  attached modules (picker over the library, reorder, detach) and optional
  subject tests; a fixed **Mocks** block for full mocks.

**Student**

- Programme -> subjects -> modules, each with a progress meter for this programme
  only -> module page listing its items in order, all open, any skippable (§13.1).
- **Mocks** as its own tab on the programme page.
- Every new screen ships its own `loading.tsx`.

## 6. Migrating existing content

Hosted DB, read-only, 2026-11-13: **2 programmes, 2 sections, 1 curriculum item
(a video), 0 `item_progress` rows, 2 programme grants, 7 mocks (drafts, none in a
curriculum).** There is effectively nothing to migrate. Existing sections become
subjects by the column default; the one video item stays a subject-level item
until the owner moves it into a module. No data script.

## 7. Deliberate deferrals

- Sub-topics inside a module (D61: later). Adding them later is a nullable
  grouping on items, not a reshape.
- The document importer that sets programmes up (later; this schema is its target).
- Module tags / difficulty / subject; per-module grants; gating.
- The "nobody got it right" and auto-difficulty dashboards (ideas only).

## 8. Open questions for the owner

1. **Quiz progress per programme.** Agree `attempts.course_id`, so a quiz done in
   MU does not tick it in Ashoka? The alternative (any attempt counts everywhere,
   no `attempts` change) contradicts D61's per-programme rule.
2. **Attempt limits on a shared quiz**: shared `max_attempts` (default, no
   change) or per programme?
3. **Subjects**: free text per programme (default, today's section titles) or a
   fixed org-wide list (QA, LR, DI, VA, CR, Maths)?
4. **Deleting a module**: refuse while attached (proposed) or detach everywhere?
5. **Practice set**: D61 calls a topic's question bank a separate practice set;
   the 2026-11-12 flow reads as quiz (mock) + PDF (document). Confirm no new
   practice-set entity is wanted.
