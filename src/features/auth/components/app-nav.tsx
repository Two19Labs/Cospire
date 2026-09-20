"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AppRole } from "../types";

// The left panel's navigation, read out of the Client's prototype: a 232px ink
// rail, group labels in small uppercase, and the active item filled in gold with
// ink text.
//
// A Client Component for one reason only -- `usePathname`, to know which item is
// current. That runs during server rendering too, so the active item is already
// marked in the HTML the browser receives and nothing here needs JavaScript to
// look right. The links are plain anchors.
//
// **Only routes that exist are listed.** The prototype's rail also shows
// Curriculums, Mock tests and Mock Analytics, and those screens are not built.
// Shipping them as dead links would make a demo look broken at the first click,
// and shipping them greyed out would put unbuilt scope in front of the Client as
// though it were nearly done. They arrive when the screens do.

interface NavItem {
  // Root items match exactly. Without that, "/admin" prefix-matches
  // "/admin/users" and two items light up at once.
  exact?: boolean;
  href: string;
  icon: "book" | "document" | "grid" | "home" | "people" | "queue" | "template";
  label: string;
}

const navByRole: Record<AppRole, { items: NavItem[]; title: string }> = {
  admin: {
    title: "Admin",
    items: [
      { href: "/admin", icon: "home", label: "Overview", exact: true },
      { href: "/admin/courses", icon: "book", label: "Programmes" },
      { href: "/admin/users", icon: "people", label: "Users" },
      { href: "/admin/documents", icon: "document", label: "Documents" },
      { href: "/admin/report-templates", icon: "template", label: "Report templates" },
    ],
  },
  mentor: {
    title: "Mentor",
    items: [{ href: "/mentor", icon: "queue", label: "Review queue", exact: true }],
  },
  student: {
    title: "Student",
    items: [
      { href: "/student", icon: "home", label: "Home", exact: true },
      { href: "/student/ars", icon: "grid", label: "ARS" },
      { href: "/student/documents", icon: "document", label: "Documents" },
    ],
  },
};

// Drawn rather than imported: five small glyphs do not justify an icon package,
// and `package.json` is a human's call under the operating manual anyway.
function Icon({ name }: { name: NavItem["icon"] }) {
  const common = {
    "aria-hidden": true,
    fill: "none",
    height: 15,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.6,
    viewBox: "0 0 16 16",
    width: 15,
  };

  if (name === "home") {
    return (
      <svg {...common}>
        <path d="M2.5 6.8 8 2.5l5.5 4.3V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5Z" />
      </svg>
    );
  }
  if (name === "book") {
    return (
      <svg {...common}>
        <path d="M2.5 3.5h4a2 2 0 0 1 1.5.7 2 2 0 0 1 1.5-.7h4v9h-4a2 2 0 0 0-1.5.7 2 2 0 0 0-1.5-.7h-4Z" />
        <path d="M8 4.2v9" />
      </svg>
    );
  }
  if (name === "people") {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="2.2" />
        <path d="M2.5 13c0-2 1.6-3.3 3.5-3.3S9.5 11 9.5 13" />
        <path d="M11 4.2a2 2 0 0 1 0 3.8M12 13c0-1.6-.5-2.6-1.4-3.2" />
      </svg>
    );
  }
  if (name === "document") {
    return (
      <svg {...common}>
        <path d="M4 2.5h5L12 5.5V13a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 13Z" />
        <path d="M9 2.5v3h3M6 8.5h4M6 10.8h4" />
      </svg>
    );
  }
  if (name === "grid") {
    return (
      <svg {...common}>
        <rect height="4.4" rx="1" width="4.4" x="2.6" y="2.6" />
        <rect height="4.4" rx="1" width="4.4" x="9" y="2.6" />
        <rect height="4.4" rx="1" width="4.4" x="2.6" y="9" />
        <rect height="4.4" rx="1" width="4.4" x="9" y="9" />
      </svg>
    );
  }
  if (name === "template") {
    return (
      <svg {...common}>
        <rect height="11" rx="1.2" width="11" x="2.5" y="2.5" />
        <path d="M2.5 6.2h11M6.2 6.2v7.3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 4.5h10M3 8h10M3 11.5h6" />
    </svg>
  );
}

export function AppNav({ role }: { role: AppRole }) {
  const pathname = usePathname() ?? "";
  const { items, title } = navByRole[role];

  return (
    <nav aria-label="Sections" className="app-nav">
      <p className="app-nav__group">{title}</p>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

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
    </nav>
  );
}
