# UPSA Pulse — Data Protection Impact Assessment (DPIA) & Act 843 Compliance Register

**Effective Date:** 4 November 2026  
**Document Version:** 1.0  
**Compliance Alignment:** Ghana Data Protection Act, 2012 (Act 843), Electronic Transactions Act, 2008 (Act 772), Cybersecurity Act, 2020 (Act 1038), and `UPSA-Pulse-6-Workflow-and-Compliance.md`

---

## 1. Data Minimization & Privacy-by-Design Controls

| Data Category | Stored? | Technical Enforcement | Retention Window |
|---|---|---|---|
| **Raw GPS Coordinates (`lat`, `lng`, `accuracy`)** | **Never stored** | Checked transiently inside `feed.verify_zone(lat, lng, accuracy)` using PostGIS `ST_Covers`; only `zone_id` and `zone_verified_until` (`now() + 15 minutes`) are written to `private.profiles`. | **0 seconds** (discarded in-memory) |
| **Student Email (`email`)** | Yes (`private.profiles`) | Stored in `private.profiles` (service-role only). Never exposed in `feed.*` views, RPCs, or moderation queues. | Until account deletion |
| **Device Binding (`device_hash`)** | Salted hash only | `encode(digest(raw_token || pepper, 'sha256'), 'hex')` in `private.devices`. | Until account deletion or revocation |
| **Per-Thread Alias (`alias_no`)** | Scoped per post | Stored in `private.thread_aliases` (`post_id`, `user_id`, `alias_no`). Unlinked on account deletion. | 90 days after post archival |
| **Posts & Replies** | Yes (`private.posts`, `private.replies`) | Active in feed for 30 days (`status = 'published'`), then archived (`status = 'archived'`), and purged after 90 days unless under legal hold. | 30d active + 90d archived |
| **Moderation & Audit Logs** | Yes (`private.moderation_actions`, `private.audit_logs`) | Append-only (`BEFORE UPDATE OR DELETE` trigger raises `append_only_table`). | 12–24 months |

---

## 2. Sub-Processor Register

| Sub-Processor | Purpose | Region | Data Processed |
|---|---|---|---|
| **Supabase (PostgreSQL + Auth + Realtime)** | Primary database, Email OTP authentication, Realtime broadcast | `eu-west-1` (Ireland) | UPSA email, hashed device token, posts, replies, votes, audit logs |
| **Vercel** | Next.js App Router hosting & Edge middleware | Global / EU | Transient HTTP requests |
| **Resend** | Transactional 6-digit OTP email delivery | EU / US | Student `@upsa.edu.gh` / `@st.upsa.edu.gh` email address |
| **Sentry** | Error monitoring (`sendDefaultPii: false`) | EU / US | Anonymized stack traces only |

---

## 3. Open Legal & Institutional Decisions Register (`[D1]` – `[D7]`)

- `[D1]` **Operator Legal Entity:** Confirm whether operated by an independent student/alumni company or under formal UPSA MOU (unofficial disclaimer active in UI and `/terms`).
- `[D2]` **Data Protection Commission Registration:** Complete Data Controller registration under Ghana Act 843 prior to public launch.
- `[D3]` **Data Protection Supervisor Contact:** Designated contact `privacy@upsapulse.app` published in `/privacy` and `/help/your-data`.
- `[D4]` **Allow-Listed UPSA Email Domains:** Seeded with `upsa.edu.gh` and `st.upsa.edu.gh` in `private.allowed_domains` (configurable via `/admin`).
- `[D5]` **Campus Zone Polygon:** Seeded with `UPSA Main Campus — Legon` WKT polygon in `private.zones` (`max_accuracy_m = 150`).
- `[D6]` **Author Unmask Policy:** `UNMASK_ENABLED=false` by default; two-person schema and RPC ready in `private.unmask_requests`.
- `[D7]` **Campus Counselling Contact:** Published on the Self-Harm Support Card (`UPSA Guidance and Counselling Unit`).

