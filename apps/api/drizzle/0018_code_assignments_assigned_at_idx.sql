-- Adds a composite index on (store_id, assigned_at) to support replacement-rate
-- automation queries and profit-report date-range filters that filter by tenant
-- then scan a time window. Built as a normal (non-concurrent) index — matching
-- the schema definition and the 0018 snapshot (concurrently: false) and its
-- sibling code_assignments indexes. CREATE INDEX CONCURRENTLY cannot run inside
-- Drizzle's transactional migrator, and is unnecessary here: a fresh migration
-- builds this on an empty table, so there is no ACCESS EXCLUSIVE lock to avoid.
CREATE INDEX "code_assignments_store_assigned_at_idx" ON "code_assignments" USING btree ("store_id","assigned_at");
