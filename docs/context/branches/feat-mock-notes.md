# feat/mock-notes

The owner's mock notes of 2026-10-19, with the answers to the questions asked:

1. Import: only the copy buttons; the prompt and document text boxes are hidden.
2. "Start again" links become buttons.
3. Paper settings fields align.
4. One back link on the review screen, styled.
5. Once every question is decided, the build panel sits at the top; panel restyled.
6. The "question IDs this import created" panel is removed everywhere (IDs stay in the bank).
7. **Sections follow the document** (owner): a mock always keeps the paper's
   sections in the paper's order, whatever the timing. One overall timer = free
   movement across sections; a timer per section = sat in order, locked once left.
   The parser reads each section's minutes from the paper and prefills them.
   Supersedes the 2026-09-21 rule "one implicit untimed section or fully sectional".
8. The last question has a submit button (last of an earlier section: next section).
9. Leaving a proctored test shows a popup, not a banner. Still warn and log only.
10. A student's mock page shows their analytics once they have sat it (student only).

## Also done

- The manual mock editor and the ID-list mock document follow the same rule:
  titled sections are kept under an overall timer; no titles = one "All
  questions" section as before. Over 10 paper sections under an overall timer
  still collapse to one block (the editor shows 10 slots).
- The parser reads a top-level `"sections": [{ "name", "minutes" }]` (prompt
  rule 14, Gemini schema) and stamps `sectionMinutes` on each staged question;
  the build step prefills the minutes and preselects per-section timing when the
  paper timed every section. Forcing one section at staging drops the minutes.
- Free mode with several sections: the section tabs move between sections
  (`type="button"`, so Enter still saves and moves on) and the palette shows the
  current question's section.
- The import pages' back links are header buttons; the in-page duplicates and
  the step trail's double numbering are gone.
- `ui-audit-fixture.mjs` publishes its mocks (stale since D41 drafts).

## Migration

`20261019100000_untimed_sections_follow_the_paper.sql`: expand only, **not
applied** to the hosted database. Until it is, building an overall-timer mock
with more than one section is refused ("structure"); everything else works.

## Verification, 2026-10-19

- typecheck, lint, 648/648 tests, production build: pass.
- `coverage/mock-notes/shots.mjs` against the ui-audit fixture on a local
  production build (hosted database), 11/11: analytics on a sat mock's page;
  "Save and go to next section" on a section's last question; the proctor popup
  opens and closes; copy button only, no prompt box; "Start again" is a button;
  build step above the review with 40 min prefilled and per-section timing
  chosen; no question-ID panel; one header back button. Screens judged by eye.
  Teardown: counts back to baseline, seeded import rows 0.
- **Not verified:** sitting a mock with several untimed sections (needs the
  migration), the "Save and submit" label on a paper's very last question (same
  code path as the section one), a real Gemini call returning `sections`.
