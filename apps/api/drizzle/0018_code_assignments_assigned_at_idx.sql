-- Adds a composite index on (store_id, assigned_at) to support replacement-rate
-- automation queries and profit-report date-range filters that filter by tenant
-- then scan a time window. Concurrent build avoids an ACCESS EXCLUSIVE lock on
-- a potentially large table in production.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "code_assignments_store_assigned_at_idx"
  ON "code_assignments" ("store_id", "assigned_at");
