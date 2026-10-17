import Link from "next/link";

import { deleteTargets, type DeleteTargetType } from "../targets";

// Step one of three (D54): a plain link, so nothing is deleted by a click. It
// opens the confirmation screen, which states what will go and asks for the
// name to be typed.
export function DeleteLink({ id, type }: { id: number; type: DeleteTargetType }) {
  return (
    <Link className="button button--secondary" href={`/admin/delete/${type}/${id}`}>
      Delete {deleteTargets[type].noun}
    </Link>
  );
}
