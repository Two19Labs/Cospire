import { notFound } from "next/navigation";

import type { Profile } from "@/features/auth/types";

import {
  parseId,
  parseQuestionFilters,
  parseQuestionNotice,
  parseQuestionType,
  questionBankBase,
} from "../list-params";
import { getParentSet, getQuestion } from "../queries/get-question";
import { listQuestionIds, listQuestions } from "../queries/list-questions";
import { listSections, listTopics } from "../queries/list-sections";
import { QuestionPage } from "./question-page";
import { QuestionsScreen } from "./questions-screen";

// The data loading behind the bank's three routes, shared by the admin and
// mentor copies so the two cannot drift. Each `app/` route checks its own role
// and hands the profile in; the base path is derived from that role, never from
// the request.

type SearchParams = Record<string, string | string[] | undefined>;

function flatten(params: SearchParams): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, typeof value === "string" ? value : undefined]),
  );
}

export async function QuestionsRoute({ profile, searchParams }: { profile: Profile; searchParams: SearchParams }) {
  const params = flatten(searchParams);
  const filters = parseQuestionFilters(params);
  const [questions, questionIds, sections, topics] = await Promise.all([
    listQuestions(filters),
    listQuestionIds(filters),
    listSections(),
    listTopics(),
  ]);

  return (
    <QuestionsScreen
      base={questionBankBase(profile.role)}
      filters={filters}
      notice={parseQuestionNotice(params.notice)}
      profile={profile}
      questionIds={questionIds}
      questions={questions}
      sections={sections}
      topics={topics}
    />
  );
}

export async function NewQuestionRoute({ profile, searchParams }: { profile: Profile; searchParams: SearchParams }) {
  const params = flatten(searchParams);
  const type = parseQuestionType(params.type) ?? "mcq";
  const parentId = parseId(params.parent);

  const [sections, topics, parent] = await Promise.all([
    listSections(),
    listTopics(),
    parentId ? getParentSet(parentId) : Promise.resolve(null),
  ]);

  // A sub-question of a set that is not there, or a set inside a set.
  if (parentId && (!parent || type === "di_stimulus")) notFound();

  return (
    <QuestionPage
      base={questionBankBase(profile.role)}
      newType={type}
      notice={null}
      parent={parent}
      profile={profile}
      question={null}
      sections={sections}
      topics={topics}
    />
  );
}

export async function EditQuestionRoute({
  id,
  profile,
  searchParams,
}: {
  id: string;
  profile: Profile;
  searchParams: SearchParams;
}) {
  const params = flatten(searchParams);
  const questionId = parseId(id);
  if (questionId === null) notFound();

  const [question, sections, topics] = await Promise.all([getQuestion(questionId), listSections(), listTopics()]);
  if (!question) notFound();

  return (
    <QuestionPage
      archiveFailed={params.error === "archive-failed"}
      base={questionBankBase(profile.role)}
      notice={parseQuestionNotice(params.notice)}
      parent={question.parent}
      profile={profile}
      question={question}
      sections={sections}
      topics={topics}
    />
  );
}
