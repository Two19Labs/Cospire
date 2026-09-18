import { stepProgress, type FormField, type FormSpec } from "../form-schema";

// What the student will see, rendered from the same spec the builder is editing.
//
// It renders the fields as disabled controls rather than reusing the student
// form component directly, because that component carries live Server Actions:
// dropping it into an admin page would give the admin buttons that submit as
// though they were the student. The markup and the classes are the student's,
// so the shapes and spacing are what the student gets.

function PreviewField({ field }: { field: FormField }) {
  const label = (
    <label>
      {field.label}
      {field.required ? "" : " (optional)"}
    </label>
  );

  if (field.type === "long_text") {
    return (
      <>
        {label}
        <textarea disabled placeholder={field.placeholder} rows={4} />
        {field.wordLimit ? <p className="muted">Maximum {field.wordLimit} words.</p> : null}
      </>
    );
  }

  if (field.type === "select") {
    return (
      <>
        {label}
        <select disabled>
          <option>Select…</option>
          {(field.options ?? []).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </>
    );
  }

  if (field.type === "radio" || field.type === "single_choice") {
    return (
      <fieldset>
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
      <label className="choice">
        <input disabled type="checkbox" />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "score_list") {
    return (
      <fieldset>
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
      <>
        {label}
        <p className="muted">File upload is not available on this round yet.</p>
      </>
    );
  }

  return (
    <>
      {label}
      <input
        disabled
        placeholder={field.placeholder}
        type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
      />
      {field.helpText ? <p className="muted">{field.helpText}</p> : null}
    </>
  );
}

export function RoundPreview({ spec }: { spec: FormSpec }) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Preview</h2>
          <p className="muted">
            What a student sees. Every page is shown here; the student answers one at a time.
          </p>
        </div>
      </div>

      {spec.steps.map((step, stepIndex) => (
        <section className="panel" key={step.key}>
          <div className="panel__header">
            <div>
              <h3>{step.title}</h3>
              {step.subtitle ? <p className="muted">{step.subtitle}</p> : null}
            </div>
            <p className="muted">
              Step {stepIndex + 1} of {spec.steps.length} ·{" "}
              {stepProgress({ stepCount: spec.steps.length, stepIndex })}%
            </p>
          </div>

          {step.sections.map((section, sectionIndex) => (
            <div className="stack-form" key={`${step.key}-${sectionIndex}`}>
              {section.title ? <h4>{section.title}</h4> : null}
              {section.description ? <p className="muted">{section.description}</p> : null}
              {section.fields.length === 0 ? (
                <p className="muted">Nothing in this section yet.</p>
              ) : (
                section.fields.map((field) => <PreviewField field={field} key={field.key} />)
              )}
            </div>
          ))}
        </section>
      ))}
    </section>
  );
}
