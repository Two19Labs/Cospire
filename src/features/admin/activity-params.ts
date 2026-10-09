// The activity log's page size and links, kept out of the server-only query.

export const activityPageSize = 25;

export function buildActivityHref(page: number): string {
  return page > 1 ? `/admin/activity?page=${page}` : "/admin/activity";
}
