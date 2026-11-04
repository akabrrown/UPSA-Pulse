**UPSA PULSE · WORKING TITLE**  
**Technical Design Document**  
Architecture, security design and the reasoning behind it

| **Field** | **Detail** |
| --- | --- |
| Project | Jodel-style, location-gated, pseudonymous campus feed for UPSA students |
| Document | TDD |
| Version | 1.0 (draft for review) |
| Date | 17 October 2026 |
| Prepared by | Codey Dev (Aka Brown) |
| Status | Draft. Colour palette is a proposal pending sampling from official UPSA artwork. Items marked \[DECISION\] need an owner answer before build. Legal points are flagged for verification and are not legal advice. |

1\. Architecture overview
=========================

A single Next.js 15 application (App Router) serves the PWA and its Route Handlers. Supabase provides Postgres with PostGIS, Auth, Realtime and scheduled jobs. All data access goes through a small set of definer functions in the database, so the rules that protect pseudonymity live in one place rather than being scattered through API code.  
Phone (PWA) ──HTTPS──▶ Vercel: Next.js 15 (RSC + Route Handlers)  
│ │ Zod validation · Arcjet · Upstash rate limit  
│ Realtime (broadcast) ▼  
└────────────────▶ Supabase  
├─ Auth (email OTP, domain allow-list hook)  
├─ Postgres + PostGIS  
│ schema private (tables, never exposed)  
│ schema feed (views + RPC functions only)  
├─ pg\_cron (hot score, archive, retention)  
└─ Realtime (zone channel: "new post" events)  
Side services: Web Push (VAPID) · Resend (OTP mail via SMTP) · Sentry

2\. Technology choices
======================

| **Layer** | **Choice** | **Why** |
| --- | --- | --- |
| Frontend | Next.js 15, TypeScript, Tailwind CSS 4, shadcn/ui | Default stack across Codey Dev projects; one codebase for UI and API; shadcn components are accessible and editable |
| Server state | TanStack Query | Cursor pagination, optimistic votes, background refetch on focus |
| Validation | Zod | Single schema shared by forms and Route Handlers |
| Database | Supabase Postgres 16 with PostGIS, pg\_cron | Point-in-polygon zone check, RLS, scheduled ranking and retention jobs |
| Auth | Supabase Auth, email OTP | No passwords to leak; domain allow-list enforced by an auth hook |
| Realtime | Supabase Realtime (broadcast on zone channel) | Drives the new-posts pill without polling |
| Rate limiting and bots | Upstash Redis rate limit, Arcjet | Per-user and per-IP limits on writes and OTP requests |
| Push | Native Web Push with VAPID | Avoids third-party push providers; iOS requires the PWA to be installed to Home Screen first, so the prompt must detect that state |
| Email | Resend as Supabase SMTP | Reliable OTP delivery |
| Hosting | Vercel (app), Supabase (data) | Free-tier-first with documented upgrade triggers (section 11) |
| Monitoring | Sentry, Vercel logs | Error tracking without behavioural tracking |
| Testing | Vitest, Playwright, SQL tests, k6 | See section 12 |

Deliberately not used: a separate NestJS or Express backend (no logic that the database functions and Route Handlers cannot hold), Firebase (data location and lock-in), Redis for feed caching (feeds are zone-wide and cheap to query; revisit with load evidence), and any ad or analytics SDK that sets tracking cookies.

3\. Key design decisions
========================

| **ADR** | **Decision** | **Reasoning and trade-off** |
| --- | --- | --- |
| 1 | PWA first, native later | No store review delay and no store fee. Trade-off: weaker iOS push; mitigated with an install prompt flow. |
| 2 | Zone is verified server-side, coordinates are never stored | Client sends a position once; server tests it against the polygon, keeps only the zone id and an expiry on the profile. Trade-off: no location history to investigate spoofing. |
| 3 | Author identity is isolated in a private schema | Client-facing views and functions never return author\_id. Trade-off: all reads go through functions, so changes need migrations. |
| 4 | Per-thread aliases assigned in the database | Alias numbers allocated under a row lock, stored in thread\_aliases. Prevents cross-thread linking and race-condition duplicates. |
| 5 | Hot ranking recomputed by a scheduled job | Score over a time-decay term, refreshed every minute for recent posts. Cheaper and more predictable than computing at read time. |
| 6 | Realtime announces, never inserts | Clients receive an event and show a pill; the user pulls new items. Avoids layout jumps and reduces client work. |
| 7 | No editing, text only, no DMs in v1 | Removes whole classes of abuse and moderation load. Trade-off: less expressive. |
| 8 | Hybrid moderation | Pre-screen holds the riskiest patterns, reports hide the rest, humans decide. Full automation is not trustworthy for defamation or self-harm context. |

4\. Zone verification
=====================

1.  Client calls navigator.geolocation.getCurrentPosition with high accuracy after the explanation screen.
2.  Client posts {lat, lng, accuracy} to /api/zone/verify over HTTPS.
3.  Server rejects readings with accuracy worse than the zone limit (starting at 150 m) and asks the user to retry outdoors.
4.  Server runs ST\_Covers(zone.boundary, ST\_SetSRID(ST\_MakePoint(lng, lat), 4326)::geography) for active zones.
5.  On success the server (service role) sets profiles.zone\_id and zone\_verified\_until = now() + 15 minutes, then discards the coordinates. Nothing about position is logged.
6.  Every write function checks zone\_verified\_until > now(). The client silently re-verifies while the app is open; on failure it shows the outside-zone screen.

<table><tbody><tr><td><strong>Known limitation </strong>Browser location can be spoofed. This design accepts that risk for v1 and relies on device trust, rate limits and moderation. Hardening options for Phase 3 are campus QR codes at gates or hall signage and campus Wi-Fi checks, each needing UPSA cooperation.</td></tr></tbody></table>

5\. Authentication, devices and sessions
========================================

*   Supabase Auth email OTP. An auth hook rejects any email whose domain is not in allowed\_domains before an OTP is sent, and rate-limits requests per address and per IP.
*   Device trust: the first device becomes the trusted device (HMAC of a device token stored in a secure cookie and IndexedDB). A second device must be approved from the first or by emailed link. Only one trusted device is active per account.
*   Sessions use Supabase JWTs in httpOnly cookies; refresh handled server-side. Sign-out revokes the device session.
*   Admin routes require is\_admin or can\_moderate read from the database on every request, not from a stale JWT claim.

6\. API surface
===============

| **Route** | **Method** | **Auth** | **Purpose** |
| --- | --- | --- | --- |
| /api/zone/verify | POST | User | Verify position, open a 15-minute window |
| /api/feed | GET | User + zone | Hot, New or Top lists with channel and kind filters, cursor paging |
| /api/posts | POST | User + zone | Create post (calls feed.create\_post) |
| /api/posts/\[id\] | GET / DELETE | User + zone | Read thread with replies / delete own post |
| /api/posts/\[id\]/replies | POST | User + zone | Create reply, allocate alias |
| /api/replies/\[id\]/answer | POST | User | Asker marks the accepted answer |
| /api/votes | PUT / DELETE | User + zone | Set or remove a vote |
| /api/reports | POST | User | Report a post or reply |
| /api/me | GET / DELETE | User | Profile summary (own karma) / delete account |
| /api/me/data-request | POST | User | File an access or correction request |
| /api/consent | POST | User | Record acceptance of a document version |
| /api/push/subscribe, /unsubscribe | POST | User | Manage Web Push subscription |
| /api/admin/queue | GET | Moderator | Held, reported and hidden items |
| /api/admin/actions | POST | Moderator | Restore, remove, warn, suspend, ban (reason required) |
| /api/admin/config | GET / PUT | Admin | Zones, channels, keyword rules, allowed domains |
| /api/admin/unmask | POST | can\_unmask, two-person | Restricted; disabled until policy approved |

All inputs are parsed with Zod before use. Errors return stable codes (zone\_not\_verified, rate\_limited, content\_held, forbidden) so the client can show the right screen.

7\. Feed and ranking
====================

*   **New:** order by created\_at desc, id desc with a keyset cursor.
*   **Hot:** order by hot\_score desc, id desc. hot\_score = (max(score, 0) + 1) / (age\_hours + 2)^1.5, recomputed every minute for published posts under 72 hours old.
*   **Top (24h):** order by score desc among posts from the last 24 hours.
*   Hot cursors can duplicate or skip an item when scores shift between pages; the client de-duplicates by id and this is accepted.
*   Vote counts are maintained by triggers on the votes table; no counts are computed in application code.
*   Hidden, held, removed and archived posts never appear in lists. A post's own thread remains reachable by its author.

8\. Realtime
============

On a successful, published post the database function notifies a broadcast channel zone:{zone\_id} with the post id and channel id only. Clients subscribed to the zone show a pill with the number of new items. Reply and answer events for a user's own posts are delivered to a private channel user:{id} and, if opted in, as Web Push. Payloads contain no author data.

9\. Security design
===================

| **Threat** | **Control** |
| --- | --- |
| Author de-anonymisation through API | Tables in a schema that is not exposed; client sees feed views and functions only; author\_id never returned; column and RLS denies verified by tests |
| De-anonymisation through timing or aliases | Aliases are per thread; response ordering does not leak first-seen order of users; no reply-count by user |
| Account takeover | OTP with attempt limits, device trust, new-device alerts, session revocation |
| Spam and automation | Arcjet on auth routes, per-user and per-IP limits, new accounts start with a lower rate limit |
| Stored XSS | All user text rendered as plain text; no HTML or markdown; links not auto-rendered in v1 |
| CSRF | SameSite cookies, origin checks on Route Handlers, JSON-only bodies |
| Mass-report abuse | Distinct-reporter thresholds, reporter reputation tracked, reversals audited |
| Insider misuse (moderators, developer) | Moderators see aliases only; unmask is two-person with audit; service-role key only in server environment; admin actions append-only |
| Data exposure in backups or logs | No coordinates or message text in application logs; Sentry scrubbing rules; encrypted backups |
| Vote manipulation | One account per trusted device, rate limits, votes weighted equally, anomaly query in admin |

10\. Privacy engineering
========================

*   Stored per user: Auth email, profile row (status, karma, zone id, zone expiry, flags), device hashes, consent records, push subscriptions.
*   Not stored: coordinates, contacts, advertising identifiers, IP addresses beyond short-lived rate-limit counters.
*   Account deletion removes the profile, devices, votes, notifications, push subscriptions and Auth user; posts and replies stay with author\_id set to null so threads remain coherent. Consent records are retained for a defined period as evidence \[DECISION D8\].
*   Scheduled jobs archive and delete content on the retention schedule (Backend Schema, section 7).
*   Processors (Supabase, Vercel, Upstash, Resend, Sentry) need data processing terms and a transfer assessment, tracked in the Workflow document.

11\. Capacity and upgrade triggers
==================================

| **Service** | **Free-tier risk** | **Upgrade trigger** |
| --- | --- | --- |
| Supabase | Free projects pause after inactivity; limited storage and no point-in-time recovery | Move to a paid plan before public launch, or earlier if database passes 400 MB or a pause occurs |
| Vercel | Hobby plan is for non-commercial use with function limits | Move to Pro if sponsorship or revenue is introduced, or limits are hit |
| Upstash | Daily command cap on free tier | Move up when rate-limit commands near 70% of daily cap |
| Resend | Daily and monthly email caps | Upgrade when OTP volume near cap during sign-up waves |
| Sentry | Event quota | Reduce sampling first, upgrade if still needed |

12\. Testing strategy
=====================

| **Type** | **Tool** | **Covers** |
| --- | --- | --- |
| Unit | Vitest | Hot-score maths, Zod schemas, zone token handling, rate-limit helpers |
| Database | SQL test scripts | Author\_id unreachable as anon and authenticated; alias uniqueness under concurrent replies; vote trigger totals; auto-hide threshold; deletion nulls author\_id |
| End to end | Playwright | Sign-up with consents, zone gate, post, reply, vote, report, delete account, install flow |
| Load | k6 | Feed reads and vote writes at expected peak; target p95 under 400 ms |
| Security | Semgrep, Dependabot, manual review | Static checks, dependency alerts, authorisation review of every Route Handler |
| Accessibility | axe-core, manual screen reader pass | WCAG 2.1 AA on core screens |
| Moderation drill | Manual | Seed test posts for each category; measure time to hide and review |

13\. Environments and deployment
================================

*   Three environments: local (Supabase CLI), staging, production, each with its own Supabase project and keys.
*   Migrations are SQL files under version control applied by the Supabase CLI in CI; never edited by hand in production.
*   CI on GitHub Actions: type check, lint, unit tests, database tests against an ephemeral database, Playwright on a preview deployment.
*   Secrets live in Vercel and Supabase environment settings only. The service-role key is never exposed to the client bundle.
*   Backups: provider backups on the paid plan plus a nightly pg\_dump to separate encrypted storage; restore tested before launch.

| **Variable (names only)** | **Used by** |
| --- | --- |
| NEXT\_PUBLIC\_SUPABASE\_URL, NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY | Client |
| SUPABASE\_SERVICE\_ROLE\_KEY | Server only: zone verification, admin actions |
| DEVICE\_HASH\_PEPPER | Server only: HMAC for device tokens |
| UPSTASH\_REDIS\_REST\_URL, UPSTASH\_REDIS\_REST\_TOKEN | Rate limiting |
| ARCJET\_KEY | Bot protection |
| VAPID\_PUBLIC\_KEY, VAPID\_PRIVATE\_KEY, VAPID\_SUBJECT | Web Push |
| SENTRY\_DSN | Error reporting |

14\. Observability and operations
=================================

*   Alerts: error rate, feed latency, failed OTP rate, report queue age, held-post backlog, cron job failures.
*   Dashboards use aggregate counts only. Operators never browse a feed of identities.
*   Runbooks for incident response, restore from backup, key rotation and moderator onboarding are in the Workflow document.

15\. Open technical questions
=============================

*   Exact zone polygon and accuracy threshold need a field survey around campus and nearby hostel areas \[D3\].
*   Confirm whether UPSA email OTP is deliverable to all student addresses; if not, an index-number check by admins is the fallback \[D2\].
*   Decide whether staging uses synthetic seed data only. Recommended: yes, never copy production data.
*   Evaluate Expo wrapper after Phase 3 if iOS push remains a pain point.