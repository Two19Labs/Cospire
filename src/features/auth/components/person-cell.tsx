// A person in a table: initials in a circle, the name, the address beneath.
// The workspace prototype draws every list of people this way. Kept beside the
// shell, not in `src/shared/ui`, until a human promotes it (manual §6.1).

export function initialsOf(name: string, email: string): string {
  const words = (name || email).trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((word) => word.charAt(0).toUpperCase()).join("") || "?";
}

export function PersonCell({ email, name }: { email: string; name: string }) {
  return (
    <div className="person">
      <span aria-hidden="true" className="person__avatar">
        {initialsOf(name, email)}
      </span>
      <div>
        <strong>{name}</strong>
        <span className="cell-sub">{email}</span>
      </div>
    </div>
  );
}
