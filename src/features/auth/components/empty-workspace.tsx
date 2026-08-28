interface EmptyWorkspaceProps {
  description: string;
  heading: string;
}

export function EmptyWorkspace({ description, heading }: EmptyWorkspaceProps) {
  return (
    <section className="empty-state">
      <span aria-hidden="true" className="empty-state__mark">
        C
      </span>
      <h2>{heading}</h2>
      <p>{description}</p>
      <p className="muted">The account and permission foundation is working.</p>
    </section>
  );
}
