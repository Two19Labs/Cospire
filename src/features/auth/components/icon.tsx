// The workspace prototype's line icons, drawn inline.
//
// Kept inside the auth feature beside the shell that introduced them rather
// than in `src/shared/ui`, per operating manual §6.1: a human promotes shared
// primitives. Fifteen small glyphs do not justify an icon package either, and
// `package.json` is a human's call anyway.
//
// Plain SVG with no hooks, so it renders from Server and Client Components
// alike and needs no JavaScript in the browser.

const paths = {
  arrow: <path d="M4 12h15m-5-5 5 5-5 5" />,
  book: <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15" />,
  file: <path d="M5 3h9l5 5v13H5Zm9 0v5h5M9 12h6m-6 4h6" />,
  grid: (
    <>
      <rect height="7" rx="1.5" width="7" x="3" y="3" />
      <rect height="7" rx="1.5" width="7" x="14" y="3" />
      <rect height="7" rx="1.5" width="7" x="3" y="14" />
      <rect height="7" rx="1.5" width="7" x="14" y="14" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10H3Z" />
      <path d="M9 20v-7h6v7" />
    </>
  ),
  logout: <path d="M9 4H4v16h5m4-13 5 5-5 5M9 12h12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9a3 3 0 1 1 5 2c-2 1-2 1-2 3m0 3v.1" />
    </>
  ),
  queue: <path d="M4 6h16M4 12h16M4 18h10" />,
  template: (
    <>
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M3 9h18M10 9v12" />
    </>
  ),
  test: (
    <>
      <rect height="17" rx="2" width="14" x="5" y="4" />
      <path d="M9 3h6v4H9Zm0 8h6m-6 4h4" />
    </>
  ),
  upload: <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" className="icon" focusable="false" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}
