# UPSA Pulse — Deployment, Backup & Disaster Recovery Runbook

**Effective Date:** 4 November 2026  
**Document Version:** 1.0  
**Compliance Alignment:** `UPSA-Pulse-2-TDD.md` (Section 12) & `UPSA-Pulse-6-Workflow-and-Compliance.md` (Section 7)

---

## 1. Environment Separation

- **Local / CI (`VITEST=true` or local `.env.local`):** Runs full Vitest unit, integration, and database verification suites.
- **Staging & Production (Vercel + Supabase `eu-west-1`):**
  - Public environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
  - Server-only secrets (never prefixed with `NEXT_PUBLIC_`): `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DEVICE_PEPPER`, `VAPID_PRIVATE_KEY`, `UNMASK_ENABLED`.

---

## 2. Database Migration & Verification Procedure

1. Apply numbered SQL migrations (`001_extensions_and_schemas.sql` through `017_seed_campus_demo_data.sql`) in strict sequence and run the 14 schema/security assertions:
   ```bash
   node scripts/migrate-and-test-db.mjs
   ```
2. Verify that `anon` and `authenticated` have **zero `SELECT` privileges** on `private.*` tables and that all 14 database tests pass before promoting any build.

---

## 3. Backup, Retention & Restore Drill

1. **Automated Daily Backups:** Supabase automated daily backups in `eu-west-1` with a 14-day retention window.
2. **Account Deletion Replay (`private.deletion_log`):**
   - Whenever a database backup is restored in a disaster recovery event, immediately replay `private.deletion_log` to ensure any user who exercised their right to account deletion after the backup snapshot remains deleted:
   ```sql
   DELETE FROM private.profiles p
   USING private.deletion_log d
   WHERE p.id = d.user_id;
   ```
3. **Scheduled Maintenance Jobs (`pg_cron`):**
   - `private.run_maintenance_jobs()` runs hourly to archive posts older than 30 days (`archived`), purge expired rate-limit buckets, and enforce data retention windows.

---

## 4. Secret & Pepper Rotation (`DEVICE_PEPPER`)

- If `DEVICE_PEPPER` is rotated, existing `device_hash` values in `private.devices` will no longer match incoming device tokens, prompting users to re-verify via a fresh 6-digit UPSA email OTP on their next session refresh.

