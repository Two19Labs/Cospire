import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { SubmitButton, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import { retryCleanupAction } from "../actions/delete-actions";
import type { PendingCleanup } from "../queries/delete-preview";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

// The second half of a delete, when it did not finish. A storage object and a
// VdoCipher video live outside the database, so they are removed after the
// transaction commits -- and a failure there must never leave the file behind
// quietly. The row is written with the delete, so this list cannot lose one.
export function CleanupsScreen({ cleanups, error, notice, profile }: {
  cleanups: PendingCleanup[]; error?: string; notice?: string; profile: Profile;
}) {
  return (
    <RoleShell
      description="A delete removes its rows in one transaction, then the file or the video in VdoCipher. Anything whose second half did not finish is here until it has."
      heading="Deletions needing attention"
      profile={profile}
      title="Deletions"
    >
      <section className="panel">
        {notice === "cleaned" ? <p className="notice notice--success">Removed. Nothing is left behind.</p> : null}
        {error === "cleanup" ? <p className="notice notice--error">It still could not be removed. The reason is below; try again, or remove it in the provider&apos;s own console.</p> : null}
        {error === "cleanup-gone" ? <p className="notice">That one is already done.</p> : null}
        {cleanups.length === 0 ? (
          <p className="panel-empty">Nothing pending. Every delete has finished both halves.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Deleted</TableHeaderCell>
                <TableHeaderCell>Still to remove</TableHeaderCell>
                <TableHeaderCell>When</TableHeaderCell>
                <TableHeaderCell>Last error</TableHeaderCell>
                <TableHeaderCell>
                  <span className="visually-hidden">Action</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cleanups.map((cleanup) => (
                <TableRow key={cleanup.id}>
                  <TableCell>{cleanup.resourceLabel}</TableCell>
                  <TableCell>{cleanup.resourceType === "video" ? "The video in VdoCipher" : "The stored file"}</TableCell>
                  <TableCell>{dateFormat.format(new Date(cleanup.createdAt))}</TableCell>
                  <TableCell className="muted">{cleanup.lastError ?? "Not attempted yet"}</TableCell>
                  <TableCell className="table__actions">
                    <form action={retryCleanupAction}>
                      <input name="cleanupId" type="hidden" value={cleanup.id} />
                      <SubmitButton compact pendingLabel="Removing…" variant="secondary">
                        Try again
                      </SubmitButton>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </RoleShell>
  );
}
