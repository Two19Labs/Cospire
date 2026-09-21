// The standard prompt an admin copies into whichever model they use, with a
// question document attached.
//
// Built from the parser's own limits rather than typed out, for the reason the
// ARS prompt gives: a prompt that drifts from the parser tells the model to
// produce something this platform then refuses. Written to the model, not the
// admin.

import { maxQuestionsPerImport } from "./import-spec";
import { maxOptions } from "./question-input";

const example = `{
  "document": "QA practice set 4",
  "questions": [
    {
      "type": "mcq",
      "section": "QA",
      "topic": "Profit and loss",
      "difficulty": "medium",
      "marks": 3,
      "question": "A shopkeeper marks an item 25% above cost and gives a 10% discount.\\nWhat is the profit percentage?",
      "options": ["12.5%", "15%", "10%", "12%"],
      "answer": "A",
      "solution": "1.25 × 0.9 = 1.125, so the profit is 12.5%.",
      "source": "Q4. A shopkeeper marks an item 25% above cost ... (a) 12.5% (b) 15% (c) 10% (d) 12%"
    },
    {
      "type": "tita",
      "section": "QA",
      "topic": "Quadratic equations",
      "difficulty": "easy",
      "marks": 3,
      "question": "If x² − 5x + 6 = 0 and x > 2, find x.",
      "answer": "3",
      "source": "Q5. If x^2 - 5x + 6 = 0 and x > 2, find x."
    },
    {
      "type": "di_set",
      "section": "DILR",
      "topic": "Tables",
      "difficulty": "medium",
      "passage": "The table below shows quarterly sales (₹ lakh) of four stores A–D.\\n[[figure]]",
      "source": "Directions for questions 6-7: The table below ...",
      "questions": [
        {
          "type": "tita",
          "marks": 3,
          "question": "What were store B's total sales across the year, in ₹ lakh?",
          "answer": "148"
        },
        {
          "type": "mcq",
          "marks": 3,
          "question": "Which store grew fastest from Q1 to Q4?",
          "options": ["A", "B", "C", "D"],
          "answer": "C"
        }
      ]
    }
  ]
}`;

export function buildQuestionImportPrompt(): string {
  return `You are converting a document of aptitude-test questions into JSON for a question bank.
Return ONLY a JSON object. No commentary before or after it.

Rules:

1. "questions" lists every question in the document, in order, at most ${maxQuestionsPerImport} in total
   (a set's sub-questions count too). Do NOT skip, merge, rewrite or invent questions.
2. "type" is one of:
   - "mcq"       one correct option
   - "mcq_multi" more than one correct option
   - "tita"      a typed numerical answer, no options
   - "di_set"    a shared passage, table or chart followed by its own questions
                 (data interpretation, caselets, reading comprehension)
3. Every question needs "question" (its text), "topic", "difficulty" ("easy", "medium" or
   "hard") and "section". Use the section names the document uses, such as QA, VARC or DILR.
   If the document does not state a difficulty, judge it; if it does not state a topic,
   name the narrowest topic the question tests.
4. Give "marks" only if the document states them. Do not guess marks.
5. For "mcq" and "mcq_multi", give "options" as a list of the option texts only, without
   the letters, at most ${maxOptions}. Give "answer" as the letter: "B", or for
   mcq_multi a list: ["A", "C"].
6. For "tita", give "answer" as the number, exactly as the key states it. If several
   forms are acceptable, give a list: ["0.5", "1/2"].
7. For "di_set", give the shared text as "passage", plus "section", "topic" and
   "difficulty", and put its questions in "questions". Sub-questions need "type",
   "question", "answer" and, if stated, "marks".
8. Answer keys are often at the end of a document. Match each answer to its question by
   number and put it on that question. If a question has no answer anywhere in the
   document, leave "answer" out rather than working one out.
9. Include "solution" when the document gives a worked solution or explanation.
10. Write maths as plain text with Unicode: x², √, π, ≤, ≥, ½, ×, ÷. Keep line breaks as \\n.
11. Wherever the document shows a chart, graph, table image, diagram or picture that the
    question needs, write [[figure]] in the text at that point. Do not describe the
    figure's numbers unless they are also written out in the text.
12. "source" is the question exactly as it appears in the document, copied word for word,
    so a reviewer can compare the two.
13. Do NOT invent ids, keys or numbering fields.

Example of the exact shape:

${example}

The document follows.`;
}
