// The standard prompt an admin copies into whichever model they use.
//
// It is built from the same constants the parser validates against, rather than
// typed out as a string literal, because a prompt that drifts from the parser
// is worse than no prompt: the model is then told to produce something this
// platform will refuse, and the admin is caught between the two with no way to
// tell which is wrong.
//
// Deliberately written to the model, not to the admin. Every sentence it
// contains is there because its absence produced a bad paste in testing:
// invented dates, questions with no type, keys the model made up, and rounds
// describing a two-way interview as though the platform could run one.

import { fieldTypes, maxStepsPerForm } from "./form-schema";
import { maxRoundsPerImport } from "./import-spec";

const example = `{
  "programme": "Masters' Union - ARS",
  "rounds": [
    {
      "name": "Application",
      "type": "form",
      "instructions": "Complete every section. You can save and come back.",
      "due": "2026-10-15",
      "mentorReviews": false,
      "pages": [
        {
          "title": "Personal details",
          "sections": [
            {
              "title": "About you",
              "questions": [
                { "label": "Full name", "type": "short_text", "prefill": "name" },
                { "label": "Date of birth", "type": "date" },
                { "label": "Gender", "type": "select", "options": ["Female", "Male", "Prefer not to say"] }
              ]
            }
          ]
        },
        {
          "title": "Your essay",
          "sections": [
            {
              "questions": [
                { "label": "Why this programme?", "type": "long_text", "wordLimit": 200 }
              ]
            }
          ]
        }
      ]
    },
    {
      "name": "Aptitude Test",
      "type": "test",
      "instructions": "A timed aptitude test.",
      "test": {
        "sections": ["Quantitative Ability", "Logical Reasoning", "Data Interpretation"],
        "questionCount": 45,
        "durationMinutes": 120,
        "negativeMarking": false
      }
    },
    {
      "name": "Interview and Group Discussion",
      "type": "interview",
      "instructions": "A panel interview followed by a group discussion, held on campus."
    }
  ]
}`;

export function buildImportPrompt(): string {
  return `You are reading an admission-process document for a coaching platform.
Return ONLY a JSON object describing the process. No commentary before or after it.

Rules:

1. "rounds" is the ordered list of stages a candidate goes through, at most ${maxRoundsPerImport}.
2. Every round needs "name" and "instructions". "instructions" is addressed to the
   candidate and is what they will read before starting.
3. "type" is one of:
   - "form"      a set of questions the candidate fills in (an application)
   - "text"      one written answer (an essay, an email-writing task)
   - "file"      an upload (a video essay, a resume, a certificate)
   - "test"      a timed aptitude test or mock
   - "interview" anything two-way and live: interview, group discussion, guesstimate
4. Dates are "opens" and "due", written as 2026-10-15. **If the document does not
   give a date, leave it out.** Do not estimate, infer or invent one.
5. For a "form" round, give "pages", at most ${maxStepsPerForm}. Each page has "sections",
   and each section has "questions".
6. Every question needs a "label" and a "type", one of:
   ${fieldTypes.join(", ")}.
   Use "select" or "radio" with an "options" list wherever the document offers a
   fixed set of answers. Use "long_text" with a "wordLimit" for anything with a
   stated word or character limit.
7. Add "required": false to any question the document says is optional. Everything
   else is treated as required.
8. Use "prefill": "name", "email" or "phone" for questions the candidate's account
   already answers.
9. For a "test" round, give what the document states under "test": "sections",
   "questionCount", "durationMinutes", "negativeMarking".
10. Do NOT invent identifiers, keys, ids or slugs. Labels only.
11. Do NOT invent questions, rounds or requirements the document does not contain.
    If the document is vague about a round, give it a name, a type and
    instructions, and leave the rest out.

Example of the exact shape:

${example}

The document follows.`;
}
