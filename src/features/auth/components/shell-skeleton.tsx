import type { ReactNode } from "react";

import type { AppRole } from "../types";

import { AppNav } from "./app-nav";

// What a screen looks like while its data is still coming.
//
// Every signed-in page renders its own `RoleShell`, so a `loading.tsx` renders
// inside the ROOT layout with no chrome at all. Left alone, clicking a nav item
// would blank the sidebar and the title bar and then draw them again a second
// later -- worse than the delay it was meant to cover. So this draws the same
// chrome, and only the content area is skeleton.
//
// Three things are real rather than skeleton, because they are known before any
// query runs and drawing them as grey blocks would make the shell flicker when
// the page arrives:
//
//   - the brand,
//   - the navigation, including which item is current: `AppNav` reads the path,
//     which needs no data,
//   - the page title, wherever the route knows it. "Users" is a constant.
//     A record's name is not, so a detail route passes nothing and gets a bar.
//
// The account block is genuinely unknown until the profile loads, so it is the
// one part of the rail that shimmers.

export function Skeleton({
  className = "",
  width,
}: {
  className?: string;
  width?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`.trim()}
      style={width ? { width } : undefined}
    />
  );
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  // Deliberately uneven. Equal-length grey bars read as a loading graphic;
  // uneven ones read as text that has not arrived, which is what they stand in
  // for.
  const widths = ["92%", "78%", "85%", "64%", "88%", "71%"];
  return (
    <div className="skeleton-lines">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} width={widths[index % widths.length]} />
      ))}
    </div>
  );
}

export function SkeletonPanel({
  children,
  lines = 2,
  title = true,
}: {
  children?: ReactNode;
  lines?: number;
  title?: boolean;
}) {
  return (
    <section className="panel" aria-hidden="true">
      {title ? (
        <div>
          <Skeleton className="skeleton--title" width="34%" />
          <Skeleton className="skeleton--small" width="52%" />
        </div>
      ) : null}
      {children ?? <SkeletonLines count={lines} />}
    </section>
  );
}

// A table's own shape: a header rule, then rows. Matching the real column count
// keeps the content from jumping sideways when it arrives.
export function SkeletonTable({ columns = 3, rows = 5 }: { columns?: number; rows?: number }) {
  // The track list is set here rather than in the stylesheet because the column
  // count is data. The CSS first tried `2fr repeat(auto-fit, minmax(4rem, 1fr))`,
  // which is not a valid track list beside a fixed first track -- grid discarded
  // the whole declaration and fell back to one column, so every cell stacked and
  // a four-column table shimmered as a list of lines.
  const template = { gridTemplateColumns: `2fr repeat(${Math.max(columns - 1, 1)}, 1fr)` };

  return (
    <div className="skeleton-table">
      <div className="skeleton-table__row skeleton-table__row--head" style={template}>
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton className="skeleton--small" key={index} width="60%" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div className="skeleton-table__row" key={row} style={template}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} width={column === 0 ? "78%" : "45%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

// The card lists used by ARS and report templates.
export function SkeletonList({ items = 3 }: { items?: number }) {
  return (
    <div className="report-list">
      {Array.from({ length: items }, (_, index) => (
        <article className="report-list__item" key={index}>
          <div className="skeleton-lines">
            <Skeleton width="38%" />
            <Skeleton className="skeleton--small" width="24%" />
          </div>
          <Skeleton className="skeleton--button" />
        </article>
      ))}
    </div>
  );
}

export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="form-fields">
      {Array.from({ length: fields }, (_, index) => (
        <div className="field" key={index}>
          <Skeleton className="skeleton--small" width="42%" />
          <Skeleton className="skeleton--input" />
        </div>
      ))}
    </div>
  );
}

export function ShellSkeleton({
  children,
  role,
  title,
}: {
  children: ReactNode;
  role: AppRole;
  title?: string;
}) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span aria-hidden="true" className="app-brand__mark">
            C
          </span>
          <span className="app-brand__name">Cospire</span>
        </div>

        <AppNav role={role} />

        <div className="app-sidebar__spacer" />

        <div className="app-account">
          <Skeleton className="skeleton--on-dark" width="70%" />
          <Skeleton className="skeleton--on-dark skeleton--small" width="90%" />
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          {title ? (
            <h1 className="app-topbar__title">{title}</h1>
          ) : (
            <span className="app-topbar__title">
              <Skeleton className="skeleton--title" width="240px" />
            </span>
          )}
          <span className="app-topbar__avatar" />
        </header>

        {/*
          Announced politely rather than silently: a skeleton is invisible to a
          screen reader, so without this the page would simply be empty until it
          was not.
        */}
        <main aria-busy="true" className="app-content">
          <span className="visually-hidden" role="status">
            Loading
          </span>
          <div className="app-content__inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
