"use client";

import { useActionState, useId } from "react";

import { SubmitButton } from "@/shared/ui";

import { saveQuestionAction } from "../actions/question-actions";
import {
  initialQuestionEditorState,
  optionFieldCount,
  type QuestionEditorState,
  type QuestionFormValues,
} from "../question-form";
import { difficulties, questionTypeLabels, type QuestionType } from "../question-input";
import type { QuestionSection } from "../queries/list-sections";
import { ImageField } from "./image-field";

// One editor for all four question types. A Client Component only for
// `useActionState`, which keeps the author's typing on the page when a save is
// refused; it still posts as a plain form with scripting off.
//
// The type is fixed once a question exists. Moving between types changes the
// shape of the answer entirely, and the database refuses the one move that
// would orphan a DI set's sub-questions.

export interface QuestionEditorProps {
  // The import review screen approves instead of saving. Same form, same
  // fields; a different Server Action and one more hidden field.
  action?: (state: QuestionEditorState, formData: FormData) => Promise<QuestionEditorState>;
  hidden?: Record<string, string>;
  imageUrls: Record<string, string>;
  initialValues: QuestionFormValues;
  orgId: number;
  parent: { body: string; id: number; sectionId: number } | null;
  questionId: number | null;
  sections: QuestionSection[];
  topics: string[];
  submitLabel?: string;
  type: QuestionType;
}

export const emptyQuestionValues: QuestionFormValues = {
  accepted: "",
  body: "",
  correctOptions: [],
  difficulty: "",
  images: [],
  marks: "",
  options: [],
  sectionId: "",
  solution: "",
  tolerance: "",
  topic: "",
};

export function QuestionEditor({
  action: saveAction = saveQuestionAction,
  hidden = {},
  imageUrls,
  initialValues,
  orgId,
  parent,
  questionId,
  sections,
  submitLabel,
  topics,
  type,
}: QuestionEditorProps) {
  const [state, action] = useActionState(saveAction, initialQuestionEditorState);
  const values = state.values ?? initialValues;
  // Per-instance ids: the import review screen shows several editors at once.
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const topicListId = id("topics");

  const isSet = type === "di_stimulus";
  const isChoice = type === "mcq" || type === "mcq_multi";

  // Enough rows for what is written plus two spare, and never fewer than four.
  // Without JavaScript there is no "add option" button, so the spare rows are
  // how a fifth option gets added: save, and two more appear.
  const filled = values.options.filter((option) => option.trim() !== "").length;
  const optionRows = Math.min(optionFieldCount, Math.max(4, filled + 2, values.options.length));

  const sectionName = parent ? sections.find((section) => section.id === parent.sectionId)?.name : null;

  return (
    <form action={action} className="panel stack-form">
      <input name="type" type="hidden" value={type} />
      {questionId ? <input name="questionId" type="hidden" value={questionId} /> : null}
      {parent ? <input name="parentId" type="hidden" value={parent.id} /> : null}
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}

      <div>
        <h2>{questionTypeLabels[type]}</h2>
        {isSet ? (
          <p className="muted">
            The shared passage or chart. Save it, then add its sub-questions,
            which carry the marks.
          </p>
        ) : null}
      </div>

      {state.problems.length > 0 ? (
        <div className="form-error" role="alert">
          <p>This question was not saved:</p>
          <ul>
            {state.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="form-fields">
        {parent ? (
          <div className="field">
            <span className="field__label">Section</span>
            <input name="sectionId" type="hidden" value={parent.sectionId} />
            <span>{sectionName ?? "The DI set's section"}</span>
            <span className="field__hint">A sub-question is always in its set&apos;s section.</span>
          </div>
        ) : (
          <label className="field" htmlFor={id("section")}>
            <span className="field__label">Section</span>
            <select className="input" defaultValue={values.sectionId} id={id("section")} name="sectionId" required>
              <option value="">Choose a section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field" htmlFor={id("topic")}>
          <span className="field__label">Topic</span>
          <input
            className="input"
            defaultValue={values.topic}
            id={id("topic")}
            list={topicListId}
            maxLength={100}
            name="topic"
            placeholder="e.g. Percentages"
            required
          />
          <datalist id={topicListId}>
            {topics.map((topic) => (
              <option key={topic} value={topic} />
            ))}
          </datalist>
        </label>

        <label className="field" htmlFor={id("difficulty")}>
          <span className="field__label">Difficulty</span>
          <select
            className="input"
            defaultValue={values.difficulty}
            id={id("difficulty")}
            name="difficulty"
            required
          >
            <option value="">Choose</option>
            {difficulties.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
              </option>
            ))}
          </select>
        </label>

        {isSet ? null : (
          <label className="field" htmlFor={id("marks")}>
            <span className="field__label">Marks</span>
            <input
              className="input"
              defaultValue={values.marks}
              id={id("marks")}
              inputMode="decimal"
              name="marks"
              placeholder="e.g. 3"
              required
            />
          </label>
        )}
      </div>

      {parent ? (
        <div className="field">
          <span className="field__label">DI set</span>
          <p className="question-text muted">{parent.body}</p>
        </div>
      ) : null}

      <label className="field" htmlFor={id("body")}>
        <span className="field__label">{isSet ? "Passage or chart description" : "Question"}</span>
        <textarea
          className="input input--area"
          defaultValue={values.body}
          id={id("body")}
          name="body"
          required
          rows={isSet ? 8 : 5}
        />
        <span className="field__hint">
          Plain text. Line breaks are kept, and symbols such as ½ x² √ π ≤ can be
          typed or pasted in.
        </span>
      </label>

      <ImageField initialImages={values.images} initialUrls={imageUrls} orgId={orgId} />

      {isChoice ? (
        <fieldset className="field">
          <legend className="field__label">
            Options — tick the {type === "mcq" ? "correct one" : "correct ones"}
          </legend>
          <div className="choice-list">
            {Array.from({ length: optionRows }, (_, index) => (
              <div className="option-row" key={index}>
                <input
                  aria-label={`Option ${index + 1} is correct`}
                  defaultChecked={values.correctOptions.includes(index)}
                  name="correct"
                  type={type === "mcq" ? "radio" : "checkbox"}
                  value={index}
                />
                <input
                  aria-label={`Option ${index + 1}`}
                  className="input"
                  defaultValue={values.options[index] ?? ""}
                  maxLength={2000}
                  name={`option-${index}`}
                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                />
              </div>
            ))}
          </div>
          <span className="field__hint">Blank rows are ignored. Save to get more rows, up to ten.</span>
        </fieldset>
      ) : null}

      {type === "numerical" ? (
        <div className="form-fields">
          <label className="field" htmlFor={id("accepted")}>
            <span className="field__label">Correct answer</span>
            <textarea
              className="input input--area"
              defaultValue={values.accepted}
              id={id("accepted")}
              name="accepted"
              required
              rows={3}
            />
            <span className="field__hint">
              One accepted form per line. 0.5, .50 and 1/2 are already treated as
              the same number, so one line is usually enough.
            </span>
          </label>
          <label className="field" htmlFor={id("tolerance")}>
            <span className="field__label">Tolerance (optional)</span>
            <input
              className="input"
              defaultValue={values.tolerance}
              id={id("tolerance")}
              inputMode="decimal"
              name="tolerance"
              placeholder="e.g. 0.01"
            />
            <span className="field__hint">How far from the answer still counts as correct. Blank means exact.</span>
          </label>
        </div>
      ) : null}

      {isSet ? null : (
        <label className="field" htmlFor={id("solution")}>
          <span className="field__label">Solution (optional)</span>
          <textarea
            className="input input--area"
            defaultValue={values.solution}
            id={id("solution")}
            name="solution"
            rows={4}
          />
          <span className="field__hint">Shown to students after they submit.</span>
        </label>
      )}

      <div className="form-actions">
        <SubmitButton pendingLabel="Saving…">
          {submitLabel ?? (questionId ? "Save changes" : "Save question")}
        </SubmitButton>
      </div>
    </form>
  );
}
