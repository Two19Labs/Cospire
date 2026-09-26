import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "../actions/logout";
import type { AppRole, Profile } from "../types";

import { AppNav, PageEyebrow } from "./app-nav";
import { Icon } from "./icon";
import { SubmitButton } from "@/shared/ui";

// The application shell, in the shape of the approved admin workspace
// prototype: an ink rail on the left with grouped navigation and the account
// at its foot, and a column on the right carrying a breadcrumb title bar over
// a cream content area.
//
// Every signed-in screen renders through here, so this is the one place the
// layout is decided. Screens pass their own panels as children and know
// nothing about the chrome around them.
//
// The page heading is the <h1> at the top of the content area, under a rust
// eyebrow naming the section, with the page's main actions beside it. Panels
// start at <h2>, so the document keeps one heading order. The title bar
// repeats the page title as a breadcrumb, which is text, not a heading.

export const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  mentor: "Mentor",
  student: "Student",
};

// The first crumb: where in the product this is.
export const roleAreas: Record<AppRole, string> = {
  admin: "Administration",
  mentor: "Mentoring",
  student: "Your preparation",
};

export const roleHomes: Record<AppRole, string> = {
  admin: "/admin",
  mentor: "/mentor",
  student: "/student",
};

export function initialOf(name: string | null | undefined, fallback?: string | null): string {
  return (name || fallback || "?").trim().charAt(0).toUpperCase();
}

interface RoleShellProps {
  // The page's main actions -- a create button, a link to a sibling screen --
  // drawn to the right of the heading.
  actions?: ReactNode;
  // A quiet link back to the list a detail screen belongs to.
  back?: { href: string; label: string };
  children: ReactNode;
  // One sentence under the heading saying what the screen is for.
  description?: ReactNode;
  // The heading, when it should read differently from the breadcrumb title.
  heading?: string;
  profile: Profile;
  title: string;
}

export function RoleShell({
  actions,
  back,
  children,
  description,
  heading,
  profile,
  title,
}: RoleShellProps) {
  // The account's own initial, for the circles. Falls back to the email when a
  // name is somehow blank, so a circle is never empty.
  const initial = initialOf(profile.name, profile.email);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <aside className="app-sidebar">
        <Link aria-label="Cospire home" className="app-brand" href={roleHomes[profile.role]}>
          <span aria-hidden="true" className="app-brand__mark">
            C
          </span>
          <span className="app-brand__name">Cospire</span>
        </Link>

        <AppNav role={profile.role} />

        {/*
          Pushed to the bottom by the spacer, as in the prototype, which ends its
          rail with the account rather than starting with it.

          The prototype's earlier concept also ended with a "View as" role
          switcher. That is impersonation, it appears nowhere in Annexure A, and
          CONTEXT records it as prototype scope not to absorb silently -- so it
          is deliberately not here.
        */}
        <div className="app-sidebar__spacer" />

        <div className="app-account">
          <span aria-hidden="true" className="app-avatar">
            {initial}
          </span>
          <div className="app-account__who">
            <p className="app-account__name">{profile.name}</p>
            <p className="app-account__email">{profile.email}</p>
          </div>
          <form action={logoutAction}>
            <SubmitButton
              className="app-account__signout"
              compact
              pendingLabel="Signing out…"
              variant="secondary"
            >
              <Icon name="logout" />
              Sign out
            </SubmitButton>
          </form>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <p className="app-breadcrumb">
            <span>{roleAreas[profile.role]}</span>
            <span aria-hidden="true">/</span>
            <span className="app-breadcrumb__here">{title}</span>
          </p>
          <div className="app-topbar__meta">
            <span className="app-topbar__role">{roleLabels[profile.role]}</span>
            <span aria-hidden="true" className="app-topbar__avatar">
              {initial}
            </span>
          </div>
        </header>

        <main className="app-content" id="main" tabIndex={-1}>
          <div className="app-content__inner">
            {back ? (
              <Link className="back-link" href={back.href}>
                <Icon name="arrow" />
                {back.label}
              </Link>
            ) : null}
            <div className="page-intro">
              <div className="page-intro__text">
                <PageEyebrow role={profile.role} />
                <h1>{heading ?? title}</h1>
                {description ? <p className="page-intro__lede">{description}</p> : null}
              </div>
              {actions ? <div className="page-intro__actions">{actions}</div> : null}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
