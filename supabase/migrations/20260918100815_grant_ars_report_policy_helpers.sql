-- The component RLS policies call these helpers as `authenticated`. The report
-- migration correctly kept the functions out of the exposed `public` schema,
-- but revoked EXECUTE from the same role whose policies invoke them. PostgreSQL
-- therefore stopped at the function boundary before it could evaluate the row
-- predicate. Grant only the two policy entry points; trigger-only helpers stay
-- revoked.

begin;

grant execute on function private.report_is_readable(bigint) to authenticated;
grant execute on function private.report_is_writable(bigint) to authenticated;

commit;
