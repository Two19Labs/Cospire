import { stepProgress, type FormField, type FormSpec } from "../form-schema";

// What the student will see, rendered from the same spec the builder is editing.
//
// The controls are disabled copies rather than the student form component
// itself, because that component carries live Server Actions: dropping it into
// an admin page would give the admin buttons that submit as though they were the
// student. The shapes, the order and the wording are the student's.

function PreviewField({ field }: { field: FormField }) {
  const label = (
    <label>
      {field.label}
      {field.required ? "" : " (optional)"}
    </label>
  );

  if (field.type === "long_text") {
    return (
      <div className="preview-field">
        {label}
        <textarea disabled placeholder={field.placeholder} rows={3} />
        {field.wordLimit ? <p className="builder__hint">Maximum {field.wordLimit} words.</p> : null}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="preview-field">
        {label}
        <select disabled>
          <option>Select…</option>
          {(field.options ?? []).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "radio" || field.type === "single_choice") {
    return (
      <fieldset className="preview-field">
        <legend>{field.label}</legend>
        {(field.options ?? []).map((option) => (
          <label className="choice" key={option}>
            <input disabled name={field.key} type="radio" />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="preview-field">
        <label className="choice">
          <input disabled type="checkbox" />
          <span>{field.label}</span>
        </label>
      </div>
    );
  }

  if (field.type === "score_list") {
    return (
      <fieldset className="preview-field">
        <legend>{field.label}</legend>
        {(field.options ?? []).map((option) => (
          <div className="field-row" key={option}>
            <label>{option}</label>
            <input disabled placeholder="Enter score" type="text" />
          </div>
        ))}
      </fieldset>
    );
  }

  if (field.type === "file") {
    return (
      <div className="preview-field">
        {label}
        <p className="builder__hint">File upload is not available on this round yet.</p>
      </div>
    );
  }

  return (
    <div className="preview-field">
      {label}
      <input
        disabled
        placeholder={field.placeholder}
        type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
      />
      {field.helpText ? <p className="builder__hint">{field.helpText}</p> : null}
    </div>
  );
}

export function RoundPreview({ spec }: { spec: FormSpec }) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Preview</h2>
          <p className="muted">
            What a student sees. Every page is shown here; they answer one at a time.
          </p>
        </div>
      </div>

      <div className="preview-frame">
        {spec.steps.map((step, stepIndex) => (
          <div className="preview-step" key={step.key}>
            <div className="preview-step__head">
              <div>
                <h3>{step.title}</h3>
                {step.subtitle ? <p className="muted">{step.subtitle}</p> : null}
              </div>
              <span className="muted">
                Step {stepIndex + 1} of {spec.steps.length} ·{" "}
                {stepProgress({ stepCount: spec.steps.length, stepIndex })}%
              </span>
            </div>

            {step.sections.map((section, sectionIndex) => (
              <div key={`${step.key}-${sectionIndex}`}>
                {section.title ? <h4>{section.title}</h4> : null}
                {section.description ? <p className="muted">{section.description}</p> : null}
                {section.fields.length === 0 ? (
                  <p className="preview-empty">Nothing in this section yet.</p>
                ) : (
                  section.fields.map((field) => <PreviewField field={field} key={field.key} />)
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
