# feat/review-queue

Slice 2 of the Client's 2026-11-23 review: one admin review queue (D65) for
help tickets (student Help page) and "Report a mistake" (a button fixed bottom
right). Branched from `origin/main` at 38c7b37.

## Decisions

- One table, `support_reports`, kind `ticket` or `mistake`, status `open` or
  `resolved`. Students only may write; mentors see nothing.

## Verification

(pending)
