// A section landing page's views, and which one an address asks for. Pure, so
// the rule is tested once (`section-views.test.ts`).

export interface SectionView {
  description: string;
  href: string;
  key: string;
  label: string;
}

// Which view a landing page shows: the one named by `?view=`, the fallback when
// anything else is in the address (a save's notice, a search, a page number --
// the admin is mid-task, not arriving), and the cards (null) otherwise.
export function pickView(
  params: Record<string, string | string[] | undefined>,
  views: SectionView[],
  fallback: string,
): string | null {
  const view = typeof params.view === "string" ? params.view : undefined;
  if (view && views.some((entry) => entry.key === view)) return view;
  return Object.keys(params).some((key) => key !== "view") ? fallback : null;
}
