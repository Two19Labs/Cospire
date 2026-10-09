import Link from "next/link";

import { Icon, type IconName } from "@/features/auth/components/icon";
import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";

// The admin overview, in the workspace prototype's layout: a card per section,
// a rail of quick actions, and a short guide for setting up a new cohort.
//
// Every link goes to a screen that exists. The prototype also opens with a row
// of platform totals; there is no query behind that yet, and invented numbers
// on the first screen a Client sees would be worse than none, so it is left out
// until counting is built on purpose.

interface Module {
  category: string;
  description: string;
  href: string;
  icon: IconName;
  linkLabel: string;
  title: string;
  tone?: "rust" | "sage";
}

const modules: Module[] = [
  {
    category: "Learning",
    description: "Organise programmes and manage who has access.",
    href: "/admin/courses",
    icon: "book",
    linkLabel: "Manage programmes",
    title: "Programmes",
  },
  {
    category: "Readiness",
    description: "Shape application journeys, rounds and student access.",
    href: "/admin/ars",
    icon: "grid",
    linkLabel: "Manage processes",
    title: "ARS processes",
    tone: "sage",
  },
  {
    category: "Assessment",
    description: "Create, organise and review your assessment questions.",
    href: "/admin/questions",
    icon: "question",
    linkLabel: "Browse questions",
    title: "Question bank",
    tone: "rust",
  },
  {
    category: "Assessment",
    description: "Build tests with questions, sections and scoring rules.",
    href: "/admin/mocks",
    icon: "test",
    linkLabel: "Manage mocks",
    title: "Mock tests",
  },
  {
    category: "People",
    description: "Manage students, mentors and administrator accounts.",
    href: "/admin/users",
    icon: "users",
    linkLabel: "Manage users",
    title: "Users",
    tone: "sage",
  },
  {
    category: "Resources",
    description: "Keep learning resources organised and control access.",
    href: "/admin/documents",
    icon: "file",
    linkLabel: "Open library",
    title: "Documents",
  },
];

const compactModules: Pick<Module, "description" | "href" | "icon" | "title" | "tone">[] = [
  { description: "Every answer and upload students hand in.", href: "/admin/ars-submissions", icon: "queue", title: "ARS submissions", tone: "sage" },
  { description: "Scores by mock, by student and by topic.", href: "/admin/analytics", icon: "grid", title: "Analytics" },
  { description: "Who signed in, and anything unusual.", href: "/admin/activity", icon: "queue", title: "Activity log" },
  { description: "The structure mentors write reports in.", href: "/admin/report-templates", icon: "template", title: "Report templates", tone: "rust" },
];

const quickActions: { href: string; icon: IconName; label: string }[] = [
  { href: "/admin/questions/new", icon: "plus", label: "Create a question" },
  { href: "/admin/questions/import", icon: "upload", label: "Import questions" },
  { href: "/admin/mocks/new", icon: "test", label: "Build a mock test" },
  { href: "/admin/documents", icon: "file", label: "Upload a document" },
];

function iconBoxClass(tone: Module["tone"]): string {
  return tone ? `icon-box icon-box--${tone}` : "icon-box";
}

export function AdminHome({ profile }: { profile: Profile }) {
  const firstName = profile.name?.trim().split(/\s+/)[0] || "Admin";

  return (
    <RoleShell
      actions={
        <Link className="button button--primary" href="/admin/users/new">
          <Icon name="plus" />
          Add a user
        </Link>
      }
      description="Every part of the workspace, one click away."
      heading={`Welcome back, ${firstName}.`}
      profile={profile}
      title="Overview"
    >
      <div className="overview-grid">
        <section aria-labelledby="workspace-title">
          <div className="section-heading">
            <h2 id="workspace-title">Manage your workspace</h2>
            <p>Content, assessment and people.</p>
          </div>
          <div className="module-grid">
            {modules.map((module) => (
              <Link className="module" href={module.href} key={module.href}>
                <div className="module__top">
                  <span className={iconBoxClass(module.tone)}>
                    <Icon name={module.icon} />
                  </span>
                  <span className="module__category">{module.category}</span>
                </div>
                <h3>{module.title}</h3>
                <p>{module.description}</p>
                <span className="module__link">
                  {module.linkLabel}
                  <Icon name="arrow" />
                </span>
              </Link>
            ))}
            {/* The day-to-day screens, smaller: a row each, two to a line. */}
            {compactModules.map((module) => (
              <Link className="module module--wide module--half" href={module.href} key={module.href}>
                <span className={iconBoxClass(module.tone)}>
                  <Icon name={module.icon} />
                </span>
                <div>
                  <h3>{module.title}</h3>
                  <p>{module.description}</p>
                </div>
                <Icon name="arrow" />
              </Link>
            ))}
          </div>
        </section>

        <aside aria-label="Shortcuts and guidance">
          <section className="quick">
            <div className="quick__head">
              <h2>Quick actions</h2>
              <p>The tasks you do most.</p>
            </div>
            {quickActions.map((action) => (
              <Link className="quick__link" href={action.href} key={action.label}>
                <Icon name={action.icon} />
                {action.label}
                <Icon name="arrow" />
              </Link>
            ))}
          </section>

          <section className="guide">
            <p className="eyebrow">A useful starting point</p>
            <h2>Setting up a new batch</h2>
            <p>Three steps, in this order.</p>
            <ol className="guide__steps">
              <li>
                <Link href="/admin/courses">Create a programme</Link>
              </li>
              <li>
                <Link href="/admin/users/new">Add your students</Link>
              </li>
              <li>
                <Link href="/admin/courses">Open the programme and grant them access</Link>
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </RoleShell>
  );
}
