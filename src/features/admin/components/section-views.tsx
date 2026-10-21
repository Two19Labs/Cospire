import Link from "next/link";

import type { SectionView } from "../section-views";

export { pickView, type SectionView } from "../section-views";

// A section's landing page offers its jobs as cards, and each job's view keeps
// them as tabs (owner, 2026-10-20). Plain links, so it works with scripting off.

export function SectionCards({ views }: { views: SectionView[] }) {
  return (
    <div className="card-grid card-grid--wide">
      {views.map((view) => (
        <Link className="course-card course-card--link" href={view.href} key={view.key}>
          <h2>{view.label}</h2>
          <p>{view.description}</p>
          <span className="course-card__bottom">
            <span />
            <span aria-hidden="true">Open →</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function SectionTabs({ current, views }: { current: string; views: SectionView[] }) {
  return (
    <nav aria-label="Section views" className="tabs">
      {views.map((view) => (
        <Link
          aria-current={view.key === current ? "page" : undefined}
          className={`tabs__link${view.key === current ? " tabs__link--current" : ""}`}
          href={view.href}
          key={view.key}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}
