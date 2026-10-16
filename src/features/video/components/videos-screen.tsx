import Link from "next/link";

import { RoleShell } from "@/features/auth/components/role-shell";
import type { Profile } from "@/features/auth/types";
import {
  SubmitButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/shared/ui";

import { addVideoAction, refreshVideoAction } from "../actions/videos";
import type { VideoPage } from "../queries/list-videos";
import {
  formatDuration,
  videoMessages,
  videosPageSize,
  videoStatusLabels,
  type VideoMessage,
} from "../video";
import { VideoUploadForm } from "./video-upload-form";

// The page heading, shared with the loading skeleton.
export const videosHeading = "Videos";

export function VideosScreen({
  message,
  profile,
  videos,
}: {
  message: VideoMessage | null;
  profile: Profile;
  videos: VideoPage;
}) {
  const { page, pageCount, rows, total } = videos;
  const notice = message ? videoMessages[message] : null;
  const firstOnPage = total === 0 ? 0 : (page - 1) * videosPageSize + 1;
  const lastOnPage = (page - 1) * videosPageSize + rows.length;

  return (
    <RoleShell
      description="Videos hosted on VdoCipher, ready to place in a programme's curriculum."
      heading={videosHeading}
      profile={profile}
      title="Videos"
    >
      {notice ? (
        <p
          className={`notice ${notice.error ? "notice--error" : "notice--success"}`}
          role={notice.error ? "alert" : undefined}
        >
          {notice.text}
        </p>
      ) : null}

      <section className="panel">
        {rows.length === 0 ? (
          <p className="panel-empty">No videos yet. Add the first one below.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Video</TableHeaderCell>
                <TableHeaderCell>Length</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Added</TableHeaderCell>
                <TableHeaderCell>
                  <span className="visually-hidden">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.title}
                    <br />
                    <span className="muted">{row.vdocipherId}</span>
                  </TableCell>
                  <TableCell>{formatDuration(row.durationSeconds)}</TableCell>
                  <TableCell>
                    <span className="tag">{videoStatusLabels[row.status]}</span>
                  </TableCell>
                  <TableCell>{row.createdAt.slice(0, 10)}</TableCell>
                  <TableCell className="table__actions">
                    {row.status === "ready" ? (
                      <Link className="title-link" href={`/admin/videos/${row.id}`}>
                        Preview →
                      </Link>
                    ) : (
                      <form action={refreshVideoAction}>
                        <input name="videoId" type="hidden" value={row.id} />
                        <SubmitButton compact pendingLabel="Checking…" variant="secondary">
                          Refresh status
                        </SubmitButton>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {total === 0 ? null : (
          <nav aria-label="Pagination" className="pagination">
            <span className="pagination__count">
              Showing {firstOnPage}-{lastOnPage} of {total} videos
            </span>
            {pageCount > 1 ? (
              <>
                {page > 1 ? (
                  <Link href={`/admin/videos?page=${page - 1}`} rel="prev">
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
                )}
                <span>
                  Page {page} of {pageCount}
                </span>
                {page < pageCount ? (
                  <Link href={`/admin/videos?page=${page + 1}`} rel="next">
                    Next
                  </Link>
                ) : (
                  <span>Next</span>
                )}
              </>
            ) : null}
          </nav>
        )}
      </section>

      <section className="panel" id="upload">
        <div className="panel__header">
          <div>
            <h2>Upload a video</h2>
            <p className="muted">
              The file goes straight to VdoCipher; it never passes through this
              application. VdoCipher then processes it, which takes a few minutes.
            </p>
          </div>
        </div>
        <VideoUploadForm />
      </section>

      <section className="panel" id="add">
        <div className="panel__header">
          <div>
            <h2>Add a video from VdoCipher</h2>
            <p className="muted">
              Paste the video id from the VdoCipher dashboard. Its length and
              status are read from VdoCipher.
            </p>
          </div>
        </div>
        <form action={addVideoAction} className="stack-form">
          <label className="field">
            <span className="field__label">VdoCipher video id</span>
            <input
              className="input"
              maxLength={32}
              minLength={32}
              name="vdocipherId"
              pattern="[0-9a-fA-F]{32}"
              required
              type="text"
            />
          </label>
          <label className="field">
            <span className="field__label">Title (optional; VdoCipher&apos;s title if blank)</span>
            <input className="input" maxLength={200} name="title" type="text" />
          </label>
          <SubmitButton pendingLabel="Adding…">Add video</SubmitButton>
        </form>
      </section>
    </RoleShell>
  );
}
