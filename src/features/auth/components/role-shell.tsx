import type { ReactNode } from "react";

import { Button } from "@/shared/ui";

import { logoutAction } from "../actions/logout";
import type { Profile } from "../types";

interface RoleShellProps {
  children: ReactNode;
  profile: Profile;
  title: string;
}

export function RoleShell({ children, profile, title }: RoleShellProps) {
  return (
    <main className="role-layout">
      <header className="role-header">
        <div>
          <p className="eyebrow">{profile.role} workspace</p>
          <h1>{title}</h1>
        </div>
        <div className="account-summary">
          <div>
            <strong>{profile.name}</strong>
            <span>{profile.email}</span>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      {children}
    </main>
  );
}
