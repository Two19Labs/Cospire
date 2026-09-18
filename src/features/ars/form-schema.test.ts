import { describe, expect, it } from "vitest";

import {
  countWords,
  stepProgress,
  validateFormSpec,
  type FormSpec,
} from "./form-schema";

// The Client's real Masters' Union ARS application, transcribed from the public
// form at cospire-mu-ars-application.lovable.app on 2026-09-18.
//
// It is here rather than in a seed file because its job is to be a test: if a
// change to the format stops expressing the Client's own application, this fails
// and says so. Only the form's structure is reproduced -- its labels and
// options, which are public -- and no applicant's data.
const muApplication: FormSpec = {
  steps: [
    {
      key: "personal",
      title: "Personal Details",
      subtitle: "Tell us about yourself.",
      sections: [
        {
          title: "About You",
          fields: [
            { key: "full_name", label: "Full Name", type: "short_text", required: true },
            { key: "date_of_birth", label: "Date of Birth", type: "date", required: true },
            { key: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Other"], required: true },
            { key: "school_name", label: "School Name", type: "short_text", required: true },
            { key: "address", label: "Address", type: "short_text", required: true },
            { key: "state", label: "State", type: "select", options: ["Mizoram", "Maharashtra", "Delhi"], required: true },
            { key: "city", label: "City", type: "short_text", required: true },
            // Already known from the account. Asking again invites a typo that
            // makes the account and the application disagree about who applied.
            { key: "email", label: "Email", type: "short_text", prefill: "email" },
            { key: "phone", label: "Phone Number", type: "short_text", prefill: "phone" },
          ],
        },
        {
          title: "Parent / Guardian Details",
          fields: [
            { key: "parent_name", label: "Parent / Guardian Name", type: "short_text", required: true },
            { key: "parent_phone", label: "Parent Phone Number", type: "short_text", required: true },
            { key: "parent_email", label: "Parent Email Address", type: "short_text", required: true },
          ],
        },
      ],
    },
    {
      key: "aptitude_scores",
      title: "Aptitude Test Details",
      subtitle: "Optional — share any scores you already have.",
      optional: true,
      sections: [
        {
          title: "Exam Scores",
          description:
            "Students who have taken any of these exams can add their scores. If you are taking the exam this year and don't have scores yet, you can skip this step and submit scores later.",
          fields: [
            {
              key: "exam_scores",
              label: "Exam Scores",
              type: "score_list",
              options: ["ACT", "SAT", "CUET", "JEE", "IPMAT / JIPMAT"],
            },
          ],
        },
        {
          title: "International Applicants",
          fields: [
            {
              key: "foreign_admit",
              label: "Do you have a foreign university admit or are you currently studying abroad?",
              type: "select",
              options: ["Yes", "No"],
              helpText:
                "International students or students with admits in top universities abroad need to fill the form and submit their SAT scores and an introductory video.",
            },
          ],
        },
      ],
    },
    {
      key: "academic",
      title: "Academic Details",
      subtitle: "Tell us about your schooling.",
      sections: [
        {
          title: "Class 10th Academic Detail",
          fields: [
            { key: "tenth_board", label: "Board", type: "select", options: ["CBSE", "ICSE", "State Board"], required: true },
            { key: "tenth_school", label: "School Name", type: "short_text", required: true },
            { key: "tenth_passing", label: "Year of Passing", type: "month_year", required: true },
            { key: "tenth_marking", label: "Marking Scheme", type: "select", options: ["Percentage", "CGPA"], required: true },
            { key: "tenth_result", label: "Result", type: "number", required: true },
          ],
        },
        {
          title: "Class 12th Results",
          description: "Applicant must have graduated from 12th standard in the year 2024 or afterwards.",
          fields: [
            { key: "twelfth_out", label: "Are your grade 12th results out?", type: "radio", options: ["Yes", "No"] },
            { key: "twelfth_expected", label: "Expected Year of Passing", type: "month_year" },
            { key: "twelfth_appearing", label: "Currently appearing in 12th", type: "checkbox" },
          ],
        },
        {
          title: "Class 11th Academic Detail",
          fields: [
            { key: "eleventh_board", label: "Board", type: "select", options: ["CBSE", "ICSE", "State Board"], required: true },
            { key: "eleventh_stream", label: "Stream", type: "select", options: ["Science", "Commerce", "Arts"], required: true },
            { key: "eleventh_marking", label: "Marking Scheme", type: "select", options: ["Percentage", "CGPA"], required: true },
            { key: "eleventh_result", label: "Percentage / CGPA", type: "number", required: true },
            { key: "eleventh_year", label: "Year", type: "short_text", required: true },
          ],
        },
        {
          title: "Course Preference",
          fields: [
            {
              key: "course_preference",
              label: "Which program are you applying for?",
              type: "single_choice",
              required: true,
              options: [
                "Technology & Business Management (TBM)",
                "Psychology & Marketing (PSM)",
                "Data Science & AI (DSAI)",
                "Finance & Entrepreneurship (FNE)",
                "Masters' Union Design School (MUDS)",
              ],
            },
          ],
        },
      ],
    },
    {
      key: "essay",
      title: "Essay",
      subtitle: "Tell us about yourself",
      sections: [
        {
          fields: [
            {
              key: "top_five",
              label:
                "What are the top 5 things you'd like us to know about you (that you haven't already mentioned in this application)?",
              type: "long_text",
              required: true,
              wordLimit: 200,
              placeholder: "Begin here...",
            },
          ],
        },
      ],
    },
  ],
};

describe("the Client's Masters' Union application", () => {
  it("is expressible in this format", () => {
    // The whole point of the format. If this ever fails, the format stopped
    // being able to describe the Client's own admission process.
    expect(validateFormSpec(muApplication)).toEqual([]);
  });

  it("has the four steps the Client's form has", () => {
    expect(muApplication.steps.map((step) => step.title)).toEqual([
      "Personal Details",
      "Aptitude Test Details",
      "Academic Details",
      "Essay",
    ]);
  });
});

describe("validateFormSpec", () => {
  it("refuses a form with no steps", () => {
    expect(validateFormSpec({ steps: [] })).toHaveLength(1);
    expect(validateFormSpec({})).toHaveLength(1);
    expect(validateFormSpec(null)).toHaveLength(1);
    expect(validateFormSpec([])).toHaveLength(1);
  });

  it("refuses a choice field with nothing to choose", () => {
    // The same failure `ars_rounds_form_has_fields` exists to stop at the round
    // level: a page asking the student to pick nothing.
    const problems = validateFormSpec({
      steps: [{ key: "s", title: "S", sections: [{ fields: [{ key: "g", label: "Gender", type: "select" }] }] }],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("at least one option");
  });

  it("refuses two fields sharing a key, across different steps", () => {
    // Answers are stored in one flat object per submission, so a shared key
    // silently overwrites an answer rather than failing loudly.
    const problems = validateFormSpec({
      steps: [
        { key: "one", title: "One", sections: [{ fields: [{ key: "name", label: "Name", type: "short_text" }] }] },
        { key: "two", title: "Two", sections: [{ fields: [{ key: "name", label: "Name again", type: "short_text" }] }] },
      ],
    });
    expect(problems.some((problem) => problem.message.includes('share the key "name"'))).toBe(true);
  });

  it("refuses an unknown field type", () => {
    const problems = validateFormSpec({
      steps: [{ key: "s", title: "S", sections: [{ fields: [{ key: "x", label: "X", type: "signature" }] }] }],
    });
    expect(problems[0].message).toContain("not a field type we can render");
  });

  it("refuses a word limit on anything but a long answer", () => {
    const problems = validateFormSpec({
      steps: [
        { key: "s", title: "S", sections: [{ fields: [{ key: "x", label: "X", type: "short_text", wordLimit: 50 }] }] },
      ],
    });
    expect(problems[0].message).toContain("long answer");
  });

  it("reports every problem at once, not just the first", () => {
    // An admin fixing a form one error per save is an admin who stops using it.
    const problems = validateFormSpec({
      steps: [
        {
          key: "BAD KEY",
          title: "",
          sections: [{ fields: [{ key: "1nope", label: "", type: "nope" }] }],
        },
      ],
    });
    expect(problems.length).toBeGreaterThan(3);
  });

  it("refuses duplicate options", () => {
    const problems = validateFormSpec({
      steps: [
        {
          key: "s",
          title: "S",
          sections: [{ fields: [{ key: "x", label: "X", type: "radio", options: ["Yes", "Yes"] }] }],
        },
      ],
    });
    expect(problems[0].message).toContain("distinct");
  });
});

describe("countWords", () => {
  it("counts the way a reader would", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords("one two three")).toBe(3);
    // A trailing newline is not a word, and neither is a double space.
    expect(countWords("one two\n")).toBe(2);
    expect(countWords("one  two")).toBe(2);
    expect(countWords("line one\nline two")).toBe(4);
  });
});

describe("stepProgress", () => {
  it("matches the Client's own progress readings", () => {
    // Their form shows 0%, 25% and 75% on steps one, two and four of four.
    expect(stepProgress({ stepCount: 4, stepIndex: 0 })).toBe(0);
    expect(stepProgress({ stepCount: 4, stepIndex: 1 })).toBe(25);
    expect(stepProgress({ stepCount: 4, stepIndex: 3 })).toBe(75);
    expect(stepProgress({ stepCount: 4, stepIndex: 4 })).toBe(100);
  });

  it("cannot report outside 0 to 100", () => {
    expect(stepProgress({ stepCount: 4, stepIndex: -2 })).toBe(0);
    expect(stepProgress({ stepCount: 4, stepIndex: 99 })).toBe(100);
    expect(stepProgress({ stepCount: 0, stepIndex: 1 })).toBe(0);
  });
});
