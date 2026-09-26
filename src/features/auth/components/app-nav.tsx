"use client";

import Link from "next/link";
import { Fragment } from "react";
import { usePathname } from "next/navigation";

import type { AppRole } from "../types";

import { Icon, type IconName } from "./icon";

// The left panel's navigation, as the approved admin workspace prototype draws
// it: an ink rail, grouped items under small uppercase labels, and the current
// item filled in gold with an ink dot.
//
// A Client Component for one reason only -- `usePathname`, to know which item is
// current. That runs during server rendering too, so the active item is already
// marked in the HTML the browser receives and nothing here needs JavaScript to
// look right. The links are plain anchors.
//
// **Only routes that exist are listed.** The prototype's rail also shows
// Curriculums and Mock Analytics, and those screens are not built.
// Shipping them as dead links would make a demo look broken at the first click,
// and shipping them greyed out would put unbuilt scope in front of the Client as
// though it were nearly done. They arrive when the screens do.

interface NavItem {
  // Root items match exactly. Without that, "/admin" prefix-matches
  // "/admin/users" and two items light up at once.
  // The rust line above the page heading on every screen in this section.
  eyebrow: string;
  exact?: boolean;
  href: string;
  icon: IconName;
  label: string;
}

// Groups follow the workspace prototype: the overview on its own, then the
// learning and assessment sections, then management.
interface NavGroup {
  items: NavItem[];
  title: string;
}

const navByRole: Record<AppRole, NavGroup[]> = {
  admin: [
    { title: "Workspace", items: [{ href: "/admin", icon: "home", label: "Overview", exact: true, eyebrow: "The admin workspace" }] },
    {
      title: "Learning & assessment",
      items: [
        { href: "/admin/courses", icon: "book", label: "Programmes", eyebrow: "Learning" },
        { href: "/admin/ars", icon: "grid", label: "ARS", eyebrow: "Admission readiness" },
        { href: "/admin/questions", icon: "question", label: "Question bank", eyebrow: "Assessment" },
        { href: "/admin/mocks", icon: "test", label: "Mock tests", eyebrow: "Assessment" },
      ],
    },
    {
      title: "Management",
      items: [
        { href: "/admin/users", icon: "users", label: "Users", eyebrow: "People" },
        { href: "/admin/documents", icon: "file", label: "Documents", eyebrow: "Resources" },
        { href: "/admin/report-templates", icon: "template", label: "Report templates", eyebrow: "Reporting" },
      ],
    },
  ],
  mentor: [
    {
      title: "Mentor",
      items: [
        { href: "/mentor", icon: "queue", label: "Review queue", exact: true, eyebrow: "Mentor" },
        { href: "/mentor/questions", icon: "question", label: "Question bank", eyebrow: "Mentor" },
      ],
    },
  ],
  student: [
    {
      title: "Student",
      items: [
        { href: "/student", icon: "home", label: "Home", exact: true, eyebrow: "Student" },
        { href: "/student/ars", icon: "grid", label: "ARS", eyebrow: "Admission readiness" },
        { href: "/student/documents", icon: "file", label: "Documents", eyebrow: "Resources" },
      ],
    },
  ],
};

function isActive(item: NavItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

// The eyebrow above a page heading names the section the page belongs to, and
// the section is exactly what the navigation already works out from the path.
// Reading it here means neither a page nor its loading skeleton has to repeat
// it, so the two cannot disagree.
export function PageEyebrow({ role }: { role: AppRole }) {
  const pathname = usePathname() ?? "";
  const item = navByRole[role].flatMap((group) => group.items).find((entry) => isActive(entry, pathname));
  return <p className="eyebrow">{item?.eyebrow ?? navByRole[role][0].title}</p>;
}

export function AppNav({ role }: { role: AppRole }) {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Sections" className="app-nav">
      {navByRole[role].map((group) => (
        <Fragment key={group.title}>
          <p className="app-nav__group">{group.title}</p>
          {group.items.map((item) => {
            const active = isActive(item, pathname);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`app-nav__link${active ? " app-nav__link--active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </Fragment>
      ))}
    </nav>
  );
}
