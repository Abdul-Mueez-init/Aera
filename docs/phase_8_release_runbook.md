# Phase 8 release runbook

## Preflight

1. Apply migrations with `pnpm --filter backend prisma:migrate:deploy`.
2. Run `pnpm --filter backend prisma:validate`, `typecheck`, `lint`, and tests.
3. Run `pnpm --filter backend check:phase8-integrity` against the target database.
4. Run `pnpm --filter backend report:legacy-quotes` and review the report.
5. Keep `LIVE_TRACKING_ENABLED` and `NOTIFICATION_OUTBOX_ENABLED` false until the staging soak starts.

## Staging soak

Enable the notification outbox first. Verify that queued rows are retried,
dead-lettered after the configured attempt limit, and never persist portal
plaintext tokens. Then enable live tracking and verify:

- only the assigned technician can post a location;
- locations are accepted only in `EN_ROUTE`;
- portal access is tenant/customer scoped;
- locations older than two minutes return status without coordinates;
- arrival, cancellation, reassignment, and completion remove the state.

## Production rollout and rollback

Enable one flag at a time and monitor error rate, queue depth, outbox `FAILED`
and `DEAD` counts, and tracking request rate. Roll back by disabling the
affected flag; the migration is additive and does not require destructive SQL.
Database recovery is a forward fix. Take a Supabase backup before any later
contract migration.
