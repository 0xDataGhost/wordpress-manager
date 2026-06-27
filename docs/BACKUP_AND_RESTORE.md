# Backup and Restore

PostgreSQL is the **sole source of truth** for all tenant data. Redis is ephemeral (cache + transient queues) and is rebuildable from the database.

---

## PostgreSQL Backup Strategy

### Recommended: Managed Database Backups

Use your cloud provider's automated backup feature (AWS RDS, GCP Cloud SQL, Supabase, etc.):

- **Daily full snapshot** — point-in-time recovery to any second within the retention window
- **WAL archiving (PITR)** — archive Write-Ahead Log segments for granular recovery
- **Retention window** — minimum 7 days for pilot; 30 days recommended for production

### Manual Backup (pg_dump)

```bash
# Full logical backup
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --file="saas_$(date +%Y%m%d_%H%M%S).dump"

# Restore
pg_restore \
  --dbname "$TARGET_DATABASE_URL" \
  --clean \
  --if-exists \
  saas_20260101_120000.dump
```

---

## What to Back Up

| Data | Location | Priority |
|------|----------|---------|
| All tenant data (stores, orders, products, customers, suppliers) | PostgreSQL | Critical |
| Digital code inventory (encrypted codes, batches, assignments) | PostgreSQL | Critical |
| Audit logs | PostgreSQL | Required by accountability policy |
| Customer access tokens | PostgreSQL | Rebuildable (generate new links) |
| Notification history | PostgreSQL | Non-critical |
| Redis cache | Redis | Not required — fully rebuildable |
| BullMQ job queues | Redis | Not required — jobs re-enqueue on next trigger |
| Dashboard build artifacts | CI / CDN | Not required — rebuild from source |

---

## Restore Procedure

### Full Database Restore

1. **Stop the API** (prevents writes to the database being restored)
2. Drop and recreate the target database (or restore to a new instance)
3. Run `pg_restore` (see above)
4. Verify migration table: `SELECT MAX(version) FROM drizzle_migrations;` — should be `0018`
5. Run `npm run db:seed` in `apps/api` to ensure RBAC catalog is current
6. **Start the API** and run the smoke tests from `deployment-checklist.md §9`

### Point-in-Time Recovery (PITR)

1. Identify the target timestamp (before the data-loss event)
2. Restore base backup to new instance
3. Apply WAL segments up to the target timestamp
4. Verify and promote the recovered standby
5. Update `DATABASE_URL` to point at the recovered instance
6. Restart API

---

## Test Your Restore

Before going live and at least **quarterly** thereafter:

```bash
# 1. Spin up a scratch PostgreSQL instance
# 2. Restore the latest backup
pg_restore --dbname "$SCRATCH_DATABASE_URL" --clean --if-exists latest.dump

# 3. Point a test API instance at the scratch DB
DATABASE_URL=$SCRATCH_DATABASE_URL node dist/index.js &

# 4. Run health check
curl http://localhost:4000/health

# 5. Spot-check tenant data via API
curl -H "Authorization: Bearer <test-token>" \
  http://localhost:4000/api/v1/stores/current
```

Document the test result (date, dump age, restore time, validation result) in your runbook log.

---

## RPO / RTO Targets (Pilot Guidance)

| Target | Recommended for Pilot |
|--------|----------------------|
| RPO (max data loss) | 24 hours (daily backup) |
| RTO (max downtime) | 4 hours |

For production at scale, reduce RPO to 1 hour via PITR and reduce RTO by automating the restore pipeline.

---

## Secret Backup

Secrets are **not** in the database. Back them up separately:

- Store in a managed secrets manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault, etc.)
- Maintain an encrypted offline copy for disaster recovery
- **Never commit to git**

> `DIGITAL_CODE_ENCRYPTION_KEY` and `DIGITAL_CODE_HASH_KEY` are the most critical — losing them makes all stored encrypted codes permanently unrecoverable, even with a full database backup.
