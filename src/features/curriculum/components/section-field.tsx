// The "which section" choice, used by the builder's Add forms and by the video
// and document upload forms when they are started from a programme.

export interface ProgrammeTarget {
  courseId: number;
  sections: { id: number; title: string }[];
}

export function SectionField({ sections }: { sections: ProgrammeTarget["sections"] }) {
  return (
    <label className="field">
      <span className="field__label">Section</span>
      <select className="input" name="sectionId" required>
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.title}
          </option>
        ))}
      </select>
    </label>
  );
}
