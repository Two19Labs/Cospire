import type { ReactNode } from "react";

import { logoutAction } from "../actions/logout";
import type { Profile } from "../types";

import { AppNav } from "./app-nav";
import { SubmitButton } from "@/shared/ui";

// The application shell, in the shape of the Client's prototype: a fixed ink
// rail on the left, and a column on the right carrying a white title bar over a
// cream content area.
//
// Every signed-in screen renders through here -- twenty of them -- so this is
// the one place the layout is decided. Screens pass their own panels as
// children and know nothing about the chrome around them.
//
// The heading is an <h1> in the title bar, so each page's panels start at <h2>
// and the document keeps one heading order. That is why the panels below all
// open at <h2> rather than repeating the page name.

const roleLabels: Record<Profile["role"], string> = {
  admin: "Admin",
  mentor: "Mentor",
  student: "Student",
};

interface RoleShellProps {
  children: ReactNode;
  profile: Profile;
  title: string;
}

export function RoleShell({ children, profile, title }: RoleShellProps) {
  // The account's own initial, for the circle in the title bar. Falls back to
  // the email when a name is somehow blank, so the circle is never empty.
  const initial = (profile.name || profile.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span aria-hidden="true" className="app-brand__mark">
            C
          </span>
          <span className="app-brand__name">Cospire</span>
        </div>

        <AppNav role={profile.role} />

        {/*
          Pushed to the bottom by the spacer, as in the prototype, which ends its
          rail with the account rather than starting with it.

          The prototype also ends with a "View as" role switcher. That is
          impersonation, it appears nowhere in Annexure A, and CONTEXT records it
          as prototype scope not to absorb silently -- so it is deliberately not
          here.
        */}
        <div className="app-sidebar__spacer" />

        <div className="app-account">
          <p className="app-account__name">{profile.name}</p>
          <p className="app-account__email">{profile.email}</p>
          <form action={logoutAction}>
            <SubmitButton variant="primary" pendingLabel="Signing out…">
              Sign out
            </SubmitButton>
          </form>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <h1 className="app-topbar__title">{title}</h1>
          <span className="app-topbar__role">{roleLabels[profile.role]}</span>
          <span aria-hidden="true" className="app-topbar__avatar">
            {initial}
          </span>
        </header>

        <main className="app-content">
          <div className="app-content__inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
