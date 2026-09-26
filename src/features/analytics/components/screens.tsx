import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/shared/ui";

import { percent } from "../aggregate";
import type {
  AttemptAnalytics,
  MentorAttemptRow,
  MockAnalytics,
  MockListRow,
  StudentListRow,
  StudentOverview,
} from "../queries/views";
import { analyticsPageSize, type Capped } from "../queries/views";
import styles from "./analytics.module.css";
import { Bar, BreakdownPanels, dateFormat, Pager, showMarks, Stat, Stats, TallyTable } from "./parts";

const share = (value: number | null, max: number) => (value === null || max <= 0 ? null : value / max);

function scoreOutOf(score: number | null, max: number | null): string {
  return score === null ? "Awaiting score" : `${showMarks(score)} / ${showMarks(max)}`;
}

// Said out loud rather than left to be noticed: an attempt with no score yet is
// not counted in any figure, and a capped read is never presented as the whole.
function Notices({ awaiting, capped }: { awaiting: number; capped: Capped | null }) {
  return (
    <>
      {awaiting ? (
        <p className="notice">
          {awaiting} submitted attempt{awaiting === 1 ? " is" : "s are"} awaiting a score and not counted in these figures.
        </p>
      ) : null}
      {capped ? (
        <p className="notice">
          These figures cover the latest {capped.shown} of {capped.total} submitted attempts.
        </p>
      ) : null}
    </>
  );
}

function proctoring(proctored: boolean): string {
  return proctored ? "Proctored" : "Unproctored (phone)";
}

// ---------------------------------------------------------------------------

export function AttemptAnalyticsScreen({
  back,
  data,
  profile,
}: {
  back: { href: string; label: string };
  data: AttemptAnalytics;
  profile: Profile;
}) {
  const { attempt, breakdown, maxMarks } = data;
  return (
    <RoleShell profile={profile} title={data.title}>
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>{data.studentName ? `${data.studentName}’s attempt` : "Your attempt"}</h2>
            <p className="muted">
              Submitted {dateFormat.format(new Date(attempt.submittedAt))}
              {attempt.submittedBy === "timer" ? " when the time ran out" : ""} · {proctoring(attempt.proctored)}
            </p>
          </div>
        </div>
        {breakdown ? (
          <>
            <Stats>
              <Stat label={`score out of ${showMarks(maxMarks)}`} value={showMarks(attempt.score)} />
              <Stat label="attempted" value={breakdown.total.attempted} />
              <Stat label="correct" value={breakdown.total.correct} />
              <Stat label="wrong" value={breakdown.total.wrong} />
              <Stat label="not answered" value={breakdown.total.unattempted} />
              <Stat label="accuracy" value={percent(breakdown.total.accuracy)} />
            </Stats>
            <p className="muted">Accuracy is correct answers out of those attempted. Time per question is not recorded.</p>
          </>
        ) : (
          <p className="notice">This attempt is awaiting its score. The breakdown appears once it has been scored.</p>
        )}
      </section>
      {breakdown ? <BreakdownPanels breakdown={breakdown} /> : null}
      <div className="toolbar">
        <Link className="button button--secondary" href={back.href}>
          {back.label}
        </Link>
      </div>
    </RoleShell>
  );
}

// ---------------------------------------------------------------------------

export function StudentOverviewScreen({
  attemptHref,
  heading,
  overview,
  profile,
  title,
}: {
  attemptHref: (attemptId: number) => string;
  heading: string;
  overview: StudentOverview;
  profile: Profile;
  title: string;
}) {
  return (
    <RoleShell profile={profile} title={title}>
      <section className="panel">
        <h2>{heading}</h2>
        <Notices awaiting={overview.awaiting} capped={overview.capped} />
        {overview.scored === 0 ? (
          <p className="muted">No submitted mock yet. Results appear here once a mock is submitted.</p>
        ) : (
          <Stats>
            <Stat label="mocks scored" value={overview.scored} />
            <Stat label="questions attempted" value={overview.total.attempted} />
            <Stat label="correct" value={overview.total.correct} />
            <Stat label="overall accuracy" value={percent(overview.total.accuracy)} />
          </Stats>
        )}
      </section>

      {overview.trends.length ? (
        <section className="panel">
          <h2>Score trend</h2>
          <p className="muted">Each mock’s attempts in the order they were submitted, as a share of full marks.</p>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Mock</TableHeaderCell>
                <TableHeaderCell>Attempt</TableHeaderCell>
                <TableHeaderCell>Submitted</TableHeaderCell>
                <TableHeaderCell>Score</TableHeaderCell>
                <TableHeaderCell>Share of full marks</TableHeaderCell>
                <TableHeaderCell>Details</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {overview.trends.flatMap((trend) =>
                trend.attempts.map((attempt, index) => (
                  <TableRow key={attempt.id}>
                    <TableCell>{index === 0 ? trend.title : ""}</TableCell>
                    <TableCell className={styles.num}>{index + 1}</TableCell>
                    <TableCell>{dateFormat.format(new Date(attempt.submittedAt))}</TableCell>
                    <TableCell className={styles.num}>{scoreOutOf(attempt.score, trend.maxMarks)}</TableCell>
                    <TableCell>
                      <Bar label={percent(share(attempt.score, trend.maxMarks))} share={share(attempt.score, trend.maxMarks)} />
                    </TableCell>
                    <TableCell>
                      <Link href={attemptHref(attempt.id)}>Breakdown</Link>
                      {attempt.proctored ? null : <span className="muted"> · unproctored</span>}
                    </TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {overview.weakest.length ? (
        <section className="panel">
          <h2>Weakest topics</h2>
          <p className="muted">
            Lowest share of questions answered correctly across every submitted mock. A question left unanswered counts
            against the topic, as it does in the score.
          </p>
          <TallyTable heading="Topic" rows={overview.weakest} />
        </section>
      ) : null}
    </RoleShell>
  );
}

// ---------------------------------------------------------------------------

export function AdminAnalyticsHome({
  mocks,
  mockPage,
  profile,
  studentPage,
  students,
}: {
  mockPage: number;
  mocks: { rows: MockListRow[]; total: number };
  profile: Profile;
  studentPage: number;
  students: { rows: StudentListRow[]; total: number };
}) {
  const href = (mockPageValue: number, studentPageValue: number) =>
    `/admin/analytics?mocks=${mockPageValue}&students=${studentPageValue}`;
  return (
    <RoleShell profile={profile} title="Analytics">
      <section className="panel">
        <h2>Mocks</h2>
        {mocks.rows.length ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Mock</TableHeaderCell>
                <TableHeaderCell>Scored attempts</TableHeaderCell>
                <TableHeaderCell>Awaiting score</TableHeaderCell>
                <TableHeaderCell>Students</TableHeaderCell>
                <TableHeaderCell>Average score</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mocks.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/admin/analytics/mocks/${row.id}`}>{row.title}</Link>
                  </TableCell>
                  <TableCell className={styles.num}>{row.scored}</TableCell>
                  <TableCell className={styles.num}>{row.awaiting}</TableCell>
                  <TableCell className={styles.num}>{row.students}</TableCell>
                  <TableCell className={styles.num}>{showMarks(row.average)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="muted">No mocks yet.</p>
        )}
        <Pager href={(page) => href(page, studentPage)} page={mockPage} size={analyticsPageSize} total={mocks.total} />
      </section>

      <section className="panel">
        <h2>Students</h2>
        {students.rows.length ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Submitted attempts</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/admin/analytics/students/${row.id}`}>{row.name}</Link>
                  </TableCell>
                  <TableCell className={styles.num}>{row.attempts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="muted">No students yet.</p>
        )}
        <Pager href={(page) => href(mockPage, page)} page={studentPage} size={analyticsPageSize} total={students.total} />
      </section>
    </RoleShell>
  );
}

// ---------------------------------------------------------------------------

export function MockAnalyticsScreen({ data, profile }: { data: MockAnalytics; profile: Profile }) {
  const { stats } = data;
  const most = Math.max(1, ...data.buckets.map((bucket) => bucket.count));
  return (
    <RoleShell profile={profile} title={data.title}>
      <section className="panel">
        <h2>Summary</h2>
        <Notices awaiting={data.awaiting} capped={data.capped} />
        {stats.count === 0 ? <p className="muted">No scored attempt yet.</p> : null}
        <Stats>
          <Stat label="scored attempts" value={data.scored} />
          <Stat label="students" value={data.students} />
          <Stat label={`average of ${showMarks(data.maxMarks)}`} value={showMarks(stats.average)} />
          <Stat label="median" value={showMarks(stats.median)} />
          <Stat label="top score" value={showMarks(stats.top)} />
          <Stat label="proctored" value={data.proctored} />
          <Stat label="unproctored (phone)" value={data.unproctored} />
        </Stats>
      </section>

      {data.buckets.length ? (
        <section className="panel">
          <h2>Score distribution</h2>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Score range</TableHeaderCell>
                <TableHeaderCell>Attempts</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.buckets.map((bucket, index) => (
                <TableRow key={bucket.from}>
                  <TableCell className={styles.num}>
                    {showMarks(bucket.from)} to {index === data.buckets.length - 1 ? showMarks(bucket.to) : `under ${showMarks(bucket.to)}`}
                  </TableCell>
                  <TableCell>
                    <Bar label={String(bucket.count)} share={bucket.count / most} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <BreakdownPanels breakdown={data.breakdown} />

      <section className="panel">
        <h2>Question by question</h2>
        <p className="muted">Share of scored attempts that got each question right, and that left it unanswered, numbered as the paper numbers them.</p>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Question</TableHeaderCell>
              <TableHeaderCell>Section · topic · difficulty</TableHeaderCell>
              <TableHeaderCell>Correct</TableHeaderCell>
              <TableHeaderCell>Not answered</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.questions.map(({ question, tally }) => {
              const right = tally.questions ? tally.correct / tally.questions : null;
              const skipped = tally.questions ? tally.unattempted / tally.questions : null;
              return (
                <TableRow key={question.id}>
                  <TableCell>
                    <Link href={`/admin/questions/${question.id}`}>Question {question.number}</Link>
                  </TableCell>
                  <TableCell>
                    {question.section} · {question.topic} · {question.difficulty}
                  </TableCell>
                  <TableCell>
                    <Bar label={percent(right)} share={right} weak={right !== null && right < 0.3} />
                  </TableCell>
                  <TableCell>
                    <Bar label={percent(skipped)} share={skipped} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {data.attempts.length ? (
        <section className="panel">
          <h2>Attempts</h2>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Submitted</TableHeaderCell>
                <TableHeaderCell>Score</TableHeaderCell>
                <TableHeaderCell>Proctoring</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.attempts.map((attempt) => (
                <TableRow key={attempt.id}>
                  <TableCell>
                    <Link href={`/admin/analytics/attempts/${attempt.id}`}>{attempt.studentName}</Link>
                  </TableCell>
                  <TableCell>{dateFormat.format(new Date(attempt.submittedAt))}</TableCell>
                  <TableCell className={styles.num}>{scoreOutOf(attempt.score, data.maxMarks)}</TableCell>
                  <TableCell>{proctoring(attempt.proctored)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <div className="toolbar">
        <Link className="button button--secondary" href="/admin/analytics">
          All analytics
        </Link>
      </div>
    </RoleShell>
  );
}

// ---------------------------------------------------------------------------

export function MentorAnalyticsScreen({
  page,
  profile,
  rows,
  total,
}: {
  page: number;
  profile: Profile;
  rows: MentorAttemptRow[];
  total: number;
}) {
  return (
    <RoleShell profile={profile} title="Student results">
      <section className="panel">
        <h2>Your students’ submitted mocks</h2>
        {rows.length ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Mock</TableHeaderCell>
                <TableHeaderCell>Submitted</TableHeaderCell>
                <TableHeaderCell>Score</TableHeaderCell>
                <TableHeaderCell>Proctoring</TableHeaderCell>
                <TableHeaderCell>Details</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.studentName}</TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{dateFormat.format(new Date(row.submittedAt))}</TableCell>
                  <TableCell className={styles.num}>{scoreOutOf(row.score, row.maxMarks)}</TableCell>
                  <TableCell>{proctoring(row.proctored)}</TableCell>
                  <TableCell>
                    <Link href={`/mentor/analytics/attempts/${row.id}`}>Breakdown</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="muted">None of your assigned students has submitted a mock yet.</p>
        )}
        <Pager href={(value) => `/mentor/analytics?page=${value}`} page={page} size={analyticsPageSize} total={total} />
      </section>
    </RoleShell>
  );
}
