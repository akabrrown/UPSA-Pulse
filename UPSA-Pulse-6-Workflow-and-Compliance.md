**UPSA PULSE · WORKING TITLE**  
**Complete Workflow and Compliance Plan**  
Documentation assessment, build workflow, operating procedures and launch gate

| **Field** | **Detail** |
| --- | --- |
| Project | Jodel-style, location-gated, pseudonymous campus feed for UPSA students |
| Document | Workflow |
| Version | 1.0 (draft for review) |
| Date | 17 October 2026 |
| Prepared by | Codey Dev (Aka Brown) |
| Status | Draft. Colour palette is a proposal pending sampling from official UPSA artwork. Items marked \[DECISION\] need an owner answer before build. Legal points are flagged for verification and are not legal advice. |

1\. Purpose and scope
=====================

This is the complete workflow for UPSA Pulse from first commit to steady operation. It has four parts: the documentation and compliance assessment (section 2), the build workflow (3 and 4), the operating workflows that run once real students use the app (5), and the launch gate and document register (6 and 7).

<table><tbody><tr><td><strong>Legal caveat </strong>Statutory references below are working notes for a qualified Ghanaian lawyer to verify against current legislation and Data Protection Commission guidance. They are not legal advice, and no document should be published with unverified legal claims.</td></tr></tbody></table>

2\. Documentation and compliance assessment
===========================================

2.1 Project profile
-------------------

| **Question** | **Answer for this project** |
| --- | --- |
| What is it | Pseudonymous, location-gated student feed (text posts, replies, votes), mobile-first PWA |
| Users | Verified UPSA students in Ghana; public-facing to that community only |
| Accounts and login | Yes, email OTP; account deletion in-app |
| Content and communication | User-generated public posts and replies; no private messaging in v1 |
| Personal data processed | Email, device hash, consent records, zone window, votes, user-generated text; no coordinates stored |
| Sensitive-data risk | Users may volunteer sensitive information (health, mental distress, accusations) in posts |
| Cookies and trackers | Essential session and device cookies only; no analytics or advertising trackers planned |
| Location | Used transiently to verify the zone; not stored |
| AI | None in Phase 1 |
| Payments, delivery, subscriptions, sellers | None |
| Third parties | Supabase, Vercel, Upstash, Resend, Sentry, Arcjet, browser push services |
| Jurisdiction | Ghana primary. Processors host data outside Ghana, so transfer safeguards apply |
| Minors | Not targeted; 18+ confirmation. Some students may be under 18, which needs a legal view \[D4\] |
| Platform stores | None in Phase 1 (PWA). Store rules apply if a native build is released later |

2.2 Classification
------------------

A = Required, B = Conditionally required, C = Recommended, D = Not applicable. Required means required by law, by a platform, or by the product's own obligations. Where the legal basis is not confirmed it is marked verify.

### Public-facing legal documents

| **Document** | **Class** | **Reason and note** |
| --- | --- | --- |
| Terms of Service | A | Needed to bind users, license user content, and give grounds to remove content and suspend accounts. Contractual and operational necessity; not tied to a specific statute here. Route /terms |
| Privacy Notice | A | The app processes personal data of people in Ghana; Act 843 requires openness about purposes and handling (verify exact provisions). Must match retention and transfers exactly. Route /privacy |
| Community Guidelines | A | The moderation system depends on published rules. Doubles as the Acceptable Use Policy. Route /community-guidelines |
| Cookie Policy (separate page) | D | Only strictly necessary cookies planned; covered by a section in the Privacy Notice. Reassess immediately if analytics, ads or third-party embeds are added. No Ghana cookie-specific rule confirmed (verify) |
| Acceptable Use Policy (separate) | D | Merged into Community Guidelines |
| Disclaimer | C | Short statements in Terms and footer: independent of UPSA unless endorsed; user posts are opinions; not academic, medical or legal advice |
| Accessibility Statement | C | Good practice and a stated WCAG 2.1 AA target; route /accessibility |
| Copyright and takedown notice | C | User content licence in Terms plus a contact route for infringement and defamation complaints. Ghana Copyright Act, 2005 (Act 690) context: verify |
| Refund, shipping, subscription, buyer protection, seller agreement | D | No payments, goods, subscriptions or sellers |
| Children's privacy policy | B | Needed if under-18 users are allowed; depends on D4 and legal advice |

### Privacy and data protection

| **Item** | **Class** | **Reason and note** |
| --- | --- | --- |
| Consent mechanism at sign-up | A | Three separate unticked boxes with version and timestamp. A privacy link is not a substitute where consent is relied on |
| Data retention and deletion procedure | A | Retention schedule in the Backend Schema; must match the Privacy Notice |
| In-app account deletion | A | Core promise to users; also mandatory in app stores if native apps are released (verify current store rules) |
| Data subject request procedure | A | Access and correction handled within an internal 30-day target (verify statutory timelines) |
| Data Protection Commission registration | A (verify) | Act 843 provides for registration of data controllers. Depends on who the controller is \[D1\] |
| Data processing agreements with processors | B | Needed with Supabase, Vercel, Upstash, Resend, Sentry, Arcjet where they process personal data; most offer standard DPAs |
| International transfer safeguards | B | Data hosted abroad; confirm whether Act 843 and Commission guidance require specific safeguards |
| Breach response procedure | A (verify) | Act 843 contains a security-compromise notification duty; confirm scope and timelines |
| Marketing consent notice | D | No marketing. Push alerts are transactional and opt-in through the browser |
| Data protection impact assessment | C | Recommended because the app combines pseudonymity, location checks and possibly sensitive disclosures |

### Security and operations (internal, not published)

| **Document** | **Class** | **Reason and note** |
| --- | --- | --- |
| Incident Response Plan | A | Needed to meet any breach duty and to handle safety incidents; section 5.6 |
| Information Security Policy | C | Short, scaled to a small team; covers keys, access, devices |
| Access Control Policy | C | Who holds admin, moderator and unmask flags; review quarterly |
| Backup and Disaster Recovery Plan | C | Restore test before launch; section 3.4 |
| Vulnerability Management Policy | C | Dependabot, Semgrep, patch targets |
| Secure Development Guidelines | C | Authorisation review checklist for every route; no secrets in repo |
| Logging and Monitoring Policy | C | What is logged and what must never be (coordinates, message text) |
| Business Continuity Plan | D | Disproportionate for v1; the recovery plan is enough |
| Third-party security assessment | C | Short vendor checklist for each processor |
| Law enforcement and disclosure procedure | C (high value) | A pseudonymous app will receive requests; defines who decides and what is recorded; section 5.3 |
| Moderator code of conduct and confidentiality terms | B | Required if student moderators are engaged |

### Technical documentation

| **Document** | **Class** | **Status** |
| --- | --- | --- |
| Product Requirements (serves as SRS) | A | Delivered (document 1) |
| Technical Design / System Architecture | A | Delivered (document 2) |
| UI/UX and design system | A | Delivered as Design Brief (document 3) |
| App Flow | A | Delivered (document 4) |
| Database schema and ERD | A | Delivered (document 5) |
| Workflow, compliance assessment | A | This document |
| API documentation | C | Route table in TDD; OpenAPI file generated from Zod schemas during build |
| Testing and QA plan | C | TDD section 12; detailed test cases written per phase |
| Deployment and environment guide | C | TDD section 13; expanded into a runbook in Phase 0 |
| Maintenance and moderator manual | C | Written in Phase 2 with the beta moderators |
| User guide | C | In-app onboarding and help page, not a separate manual |
| Change log and release notes | C | Kept from first release |
| Dependency and licence register | C | Generated from the lockfile each release |

### Business and platform

| **Item** | **Class** | **Reason and note** |
| --- | --- | --- |
| Written approval or MoU with UPSA / SRC | B (strongly recommended) | Needed before using the UPSA name or crest; gives an escalation route for threats and welfare cases |
| Software development agreement and statement of work | B | Only if a client such as the SRC commissions the work |
| IP assignment | B | Needed if ownership transfers to a sponsor |
| NDA | D | Not needed unless UPSA shares confidential material |
| App store compliance documents | B | Only for a later native release |
| Payment provider terms | D | No payments |

### Other Ghanaian legal points to verify (no assumption made)

*   Whether the Electronic Transactions Act, 2008 (Act 772) affects electronic consent records or intermediary responsibility for user content.
*   Whether the Cybersecurity Act, 2020 (Act 1038) creates any obligation for a small service of this kind.
*   Civil defamation exposure for posts naming lecturers or students, and what takedown practice reduces risk.
*   Whether students under 18 can validly consent, and what Act 843 requires for children's data.
*   Whether UPSA, as a public institution, has IT or student-data policies that apply to an app using its name or domains.

2.3 Public pages and where they appear
--------------------------------------

| **Page** | **Route** | **Linked from** |
| --- | --- | --- |
| Terms of Service | /terms | Footer, sign-up consent, Me > Legal |
| Privacy Notice (includes cookie section) | /privacy | Footer, sign-up consent, location explainer, Me > Privacy |
| Community Guidelines | /community-guidelines | Footer, sign-up consent, compose reminder, report sheet |
| Accessibility Statement | /accessibility | Footer, Me > Legal |
| Data request and deletion help | /help/your-data | Me > Privacy, Privacy Notice |

Each page shows its version and effective date. Version changes trigger the re-acceptance flow (App Flow F14). Documents describing security plans, moderation thresholds in detail, or keyword lists are never published.

2.4 Questions that affect correctness
-------------------------------------

| **#** | **Question** | **Why it matters** |
| --- | --- | --- |
| 1 | Who is the data controller and will the app be registered with the Data Protection Commission under that name? | Names the responsible party in the Privacy Notice and registration |
| 2 | Is UPSA or the SRC an official partner, and may the name be used? | Brand, escalation route, institutional risk |
| 3 | Are student email addresses on a stable UPSA domain, and can they all receive mail? | Sign-up method |
| 4 | Who staffs moderation and when? | Launch gate and published review targets |
| 5 | Who are the two unmask holders and what written basis is acceptable? | Whether the capability may be enabled at all |
| 6 | Counselling unit contact details and agreement to be listed | Support card content |

3\. Build workflow
==================

3.1 Phases
----------

| **Phase** | **Indicative time (solo developer)** | **Main work** | **Exit criteria** |
| --- | --- | --- | --- |
| 0 Foundations | 1 week | Repo and CI, three Supabase projects, apply schema to scratch project, auth hook for domains, zone survey, design tokens in Figma | All section-9 database tests pass; sign-in works on staging |
| 1 MVP build | 4 to 5 weeks | Consent and onboarding, zone flow, feed and sorting, compose, thread and aliases, votes, reports, admin queue, alerts, account deletion, data request, legal pages (drafted and lawyer-reviewed) | Every Must requirement demonstrable on staging; Playwright suite green |
| 2 Closed beta | 3 weeks | 50 to 150 invited students, moderators trained, exam-week drill, fix cycle | Safety targets met for two weeks; no open Sev-1; legal pages live |
| 3 Public launch | 1 week plus launch event | Paid-tier upgrades, backups verified, announcement during a busy week | Launch checklist (section 6) fully ticked |
| 4 Growth | Ongoing | Images with EXIF stripping, polls, spoofing hardening, native wrapper if justified | Decided from data and moderation load |

Times are rough planning figures for one developer working alongside studies and other projects; they will move. Phases are gated by exit criteria, not dates.

3.2 Build order inside Phase 1
------------------------------

1.  Auth, profile creation, consent records and device trust.
2.  Zone verification endpoint and write-function guards.
3.  Feed read functions and the feed screen (New first, then Hot and Top).
4.  Compose and create\_post with pre-screen; held and published paths.
5.  Thread, replies and alias allocation, including concurrency test.
6.  Votes, karma, auto-hide.
7.  Reports and thresholds, then the admin queue and moderation actions.
8.  Alerts, then Web Push with the iOS install detection.
9.  Account deletion, data request form, legal pages and re-acceptance.
10.  Hardening pass: rate limits, Arcjet, Sentry scrubbing, accessibility audit, k6 load test.

3.3 Day-to-day development workflow
-----------------------------------

*   Trunk-based development with short-lived branches named by type and requirement ID (for example feat/POST-3-prescreen).
*   Every change reaches main through a pull request. Required checks: type check, lint, unit tests, database tests, Playwright on a preview deployment.
*   Database changes are new numbered migration files only. No manual edits to staging or production.
*   Definition of done: requirement ID met, tests added, error codes handled in the UI, accessibility checked, docs updated if behaviour changed, no new dependency without a recorded reason and licence.
*   Authorisation review: every new Route Handler lists its auth level, zone requirement and rate limit in the pull request description.
*   Weekly 30-minute review of open decisions (PRD section 13) and risks.

3.4 Environments, release and recovery
--------------------------------------

| **Step** | **Action** |
| --- | --- |
| Release | Merge to main, automatic deploy to staging, smoke test, manual promotion to production, tag release, update change log |
| Rollback | Revert deployment in Vercel; for migrations, apply a forward fix migration; never edit applied migrations |
| Backups | Provider backups plus nightly dump to separate encrypted storage |
| Restore test | Restore the latest dump into a scratch project and run the database tests; done before launch and every quarter |
| Key rotation | Rotate service-role key, VAPID keys and device pepper on suspected exposure and annually; rotating the device pepper forces device re-approval |
| Dependency updates | Dependabot weekly; security patches within 7 days; major upgrades scheduled |

4\. Moderation team workflow
============================

4.1 Setup
---------

1.  Confirm staffing and hours \[D5\]. If the 2-hour priority window cannot be covered, do not open public posting.
2.  Agree and sign the moderator code of conduct and confidentiality terms.
3.  Train on the Community Guidelines, the queue tool, and the escalation path using seeded test posts.
4.  Set up rotation, with a cap on hours in the queue and a debrief channel for distressing content.
5.  Enable the starter keyword rules and review them with moderators before launch.

4.2 Daily queue routine
-----------------------

1.  Open the queue (priority first, then oldest). Priority items: self-harm, threats, doxxing.
2.  Decide each item: restore, remove, warn, suspend or ban. A reason is mandatory.
3.  For anything involving immediate risk, follow the escalation workflow (5.2) before closing the item.
4.  Clear all held items older than the review target before ending the shift.
5.  Log queue age at shift end; the admin dashboard tracks the 95% target.

5\. Operating workflows
=======================

5.1 Report triage
-----------------

| **Priority** | **Triggers** | **Target** | **Steps** |
| --- | --- | --- | --- |
| P1 | Self-harm, threat of violence, doxxing | 2 hours, 07:00 to 23:00 | Auto-hide at 2 reports; moderator confirms; apply 5.2 if risk is real; author sees support card where relevant |
| P2 | Harassment, hate, sexual, exam leak, false claim | 24 hours | Auto-hide at 5 reports or keyword hold; moderator decides; notify author and reporters of outcome |
| P3 | Spam, other | 72 hours | Batch review; ban repeat spammers |

5.2 Risk escalation (self-harm or threat)
-----------------------------------------

1.  Moderator hides the post and marks it P1 in the queue.
2.  Moderator alerts the on-call admin through the agreed channel with the post id only. Identity is not shared in chat.
3.  Admin checks the situation. If there is a credible, imminent risk to a person, the admin follows the pre-agreed route to UPSA security or the Guidance and Counselling Unit \[D6, D7\] and, where life is at risk, emergency services.
4.  If identification is needed, the two-person unmask workflow (5.3) applies, with basis credible threat.
5.  Everything is recorded in the audit log with times and decisions. Follow-up review within 7 days to improve rules.

5.3 Unmask and disclosure
-------------------------

1.  Only enabled after written policy approval \[D6\]. Until then no unmask is possible.
2.  Allowed bases: valid legal request, credible threat to a person, or referral from UPSA's disciplinary process.
3.  Holder A opens a request with the basis and reference. Holder B independently approves or rejects. The same person cannot do both.
4.  On approval the identity is revealed only to the holders. The admin discloses it to the authorised recipient and records who, when, what and why.
5.  Requests are reviewed quarterly. Any misuse is a reportable incident under 5.6.

5.4 Data subject requests and account deletion
----------------------------------------------

1.  Request arrives through /help/your-data or the in-app form; receipt sent automatically; due date set to 30 days (verify statutory timeline).
2.  Admin checks the request comes from the signed-in account owner.
3.  Access: export the profile row, consents, devices (hashed), notifications and the user's own posts and replies through an admin-run query. Do not include other users' data.
4.  Correction: update the field or explain why it cannot be changed (for example, content already posted can be deleted but not edited).
5.  Deletion is self-service (App Flow F12); the admin only assists if sign-in is impossible, after verifying identity by the UPSA email.
6.  Mark the request complete and send confirmation. Overdue requests show on the dashboard.

5.5 Takedown complaints (defamation, privacy, copyright)
--------------------------------------------------------

1.  Complaints arrive at a published contact address.
2.  Admin logs the complaint, identifies the post and acts within 24 hours: hide pending review if the claim is plausible.
3.  Moderator or admin reviews against the Guidelines and Terms; restore or remove and record the reason.
4.  Complainant receives an outcome message. Serious or legal threats go to the lawyer on retainer.

5.6 Incident response
---------------------

| **Severity** | **Examples** | **First response** |
| --- | --- | --- |
| Sev-1 | Suspected data exposure, author identities reachable, unmask misuse, service down during exam period | Contain within 1 hour, notify developer and admin immediately |
| Sev-2 | Moderation outage, feed errors for many users, push failing | Respond within 4 hours |
| Sev-3 | Minor bugs, single-user issues | Next working day |

1.  Detect through alerts, a report, or a user message. Open an incident record with a time and owner.
2.  Contain: disable the affected route, revoke keys or sessions, switch the app to read-only if needed.
3.  Assess: what data, how many people, was identity involved. Preserve logs.
4.  Notify: if personal data was compromised, decide with the lawyer about notifying the Data Protection Commission and affected users and within what time (verify Act 843 duties). Inform UPSA contacts if students are at risk.
5.  Fix and verify: patch, run the database and security tests, restore normal service.
6.  Review: written post-incident note within 7 days with causes and changes to tests or policy.

5.7 Bans and appeals
--------------------

1.  Moderator applies a timed suspension for a first serious breach and a ban for repeated or severe breaches, with a reason.
2.  The user sees the category and any expiry, and can appeal once at a time.
3.  A different moderator reviews within 5 working days and records the decision.
4.  Device trust prevents a banned person from simply opening a second account on the same device.

5.8 Exam period surge
---------------------

*   Two weeks before exams: enable stricter hold rules for exam-related keywords; extend moderator hours; brief the UPSA liaison.
*   During exams: daily review of held posts and an end-of-day summary.
*   After exams: review false positives and update the keyword list.

5.9 Legal document updates
--------------------------

1.  Draft the change, have it reviewed, and write a plain-language summary.
2.  Insert a new row in legal\_documents and publish the page with version and date.
3.  Mark the new version current; users see the re-acceptance sheet at next sign-in.
4.  Archive the previous version for reference. Update the change log.

5.10 Routine operations calendar
--------------------------------

| **Frequency** | **Task** |
| --- | --- |
| Daily | Queue age, alert review, held-post backlog |
| Weekly | Dependency updates, error review, open decision review |
| Monthly | Metrics against targets, free-tier usage vs upgrade triggers, keyword rule review |
| Quarterly | Restore test, access flag review, unmask log review, accessibility spot check |
| Annually | Key rotation, policy and Privacy Notice review, vendor reassessment |
| On feature change | Reassess only the documents the feature affects; update the register |

6\. Launch gate
===============

All items must be ticked before opening public posting. Items that are not ticked do not block the closed beta unless marked.

| **Area** | **Check** | **Beta** | **Public** |
| --- | --- | --- | --- |
| Legal | Terms, Privacy Notice and Community Guidelines reviewed by a lawyer and live; versions recorded | Yes | Yes |
| Legal | Data Protection Commission registration position confirmed and completed if required | Confirm | Yes |
| Legal | Processor agreements and transfer position documented | Confirm | Yes |
| Institution | Written position from UPSA or SRC on name, support and escalation | Preferred | Yes |
| Safety | Moderators trained; priority window covered; escalation contacts and counselling details confirmed | Yes | Yes |
| Safety | Unmask feature disabled, or policy approved and holders named | Yes | Yes |
| Security | Database tests (Backend Schema section 9) all pass against staging and production | Yes | Yes |
| Security | No author identifier in any client response (manual review of all payloads) | Yes | Yes |
| Security | Rate limits and bot protection active; key rotation tested | Yes | Yes |
| Reliability | Paid-tier database, backups running, restore test passed | No | Yes |
| Reliability | Alerts configured and delivered to the on-call phone | Yes | Yes |
| Product | Accessibility check, low-end Android performance check, iOS install and push flow checked | Yes | Yes |
| Product | Account deletion and data request flows tested end to end | Yes | Yes |
| Content | Seed Asks and welcome posts prepared; channel descriptions final | Yes | Yes |

7\. Documentation compliance report and register
================================================

7.1 Status on 17 October 2026
-----------------------------

| **Category** | **Items** |
| --- | --- |
| Documents created | PRD, TDD, Design Brief, App Flow, Backend Schema, Workflow and Compliance Assessment (this document) |
| Documents already present and verified | None. This is a new project with no existing documents |
| Classified not applicable | Separate Cookie Policy, separate Acceptable Use Policy, refund, shipping, subscription, buyer protection, seller agreement, marketing consent, payment terms, business continuity plan, NDA (unless UPSA requires) |
| Outstanding | Terms, Privacy Notice, Community Guidelines, Accessibility Statement (drafting waits for decisions D1, D2, D4, D8); security policies; incident, disclosure and moderator documents; maintenance and moderator manual; MoU or approval from UPSA |
| Software changes not yet implemented | Everything: this suite documents the design only. No code, database or legal pages exist yet |
| Questions needing verification or professional review | Section 2.2 items marked verify, section 2.2 other Ghanaian legal points, section 2.4 questions |
| Tests performed | SQL files syntax-checked with a PostgreSQL parser; colour contrast ratios calculated; documents rendered and visually reviewed. Not yet done: running the SQL on a live database, any application tests, any legal review |

7.2 Document register and maintenance
-------------------------------------

| **Document** | **Owner** | **Review trigger** |
| --- | --- | --- |
| PRD | Product owner | Scope, policy or decision changes |
| TDD | Lead developer | Architecture, provider or security change |
| Design Brief | Designer / developer | Brand colour confirmation; major UI change |
| App Flow | Developer | Any new or changed user journey |
| Backend Schema | Developer | Every migration; keep SQL and document in step |
| Workflow and Compliance | Product owner and admin | Quarterly, and when features, data practices or law change |
| Public legal pages | Admin with lawyer | Each change to data practice or features; annual review |

Keep one source of truth: if the code and a document disagree, fix whichever is wrong the same day and record it in the change log. Never claim a security, privacy, deletion or consent function in a public document unless it exists and has been tested.