**UPSA PULSE · WORKING TITLE**  
**Product Requirements Document**  
What we are building, for whom, and the limits we are setting

| **Field** | **Detail** |
| --- | --- |
| Project | Jodel-style, location-gated, pseudonymous campus feed for UPSA students |
| Document | PRD |
| Version | 1.0 (draft for review) |
| Date | 17 October 2026 |
| Prepared by | Codey Dev (Aka Brown) |
| Status | Draft. Colour palette is a proposal pending sampling from official UPSA artwork. Items marked \[DECISION\] need an owner answer before build. Legal points are flagged for verification and are not legal advice. |

1\. Overview
============

UPSA Pulse (working title) is a location-gated, pseudonymous campus feed for verified UPSA students. Students who are physically on or around campus read short posts, ask questions and answer each other without attaching their names to what they say. It borrows the local-feed idea Jodel popularised, where a feed is useful because everyone in it shares the same place, and narrows it to a single university.

1.1 The problem
---------------

*   Questions about registration, lecturers, hostels, food, transport and lost items get lost in class WhatsApp groups that are noisy, visible by name and dominated by a few voices.
*   Fresh students in particular hold back from asking because a wrong question under their own name feels costly.
*   Public social media is not local, so answers are generic. Official channels are accurate but slow.

1.2 The proposed product
------------------------

A mobile-first web app (installable PWA) with one shared feed per campus zone. Posts are short text, grouped into channels, ranked by votes and recency. Any post can be flagged as an **Ask**, which lets the asker mark one reply as the answer. Identity is hidden from other students by per-thread aliases, but accounts are tied to verified UPSA email so abuse can be acted on.

1.3 What it is not
------------------

*   Not an official UPSA channel unless the university formally endorses it. The name and crest are not used without approval \[DECISION D1\].
*   Not a marketplace (UPSA students already have Campus Mart on Voice of UPSA), not a dating app, and not a direct channel for complaints to administration.
*   Not untraceable. The privacy notice must say plainly that identity is retained and can be disclosed under defined legal or disciplinary process.

2\. Product principles
======================

1.  **Place makes it relevant.** No feed without being in the zone. Quality of the zone matters more than size of the user base.
2.  **Pseudonymous, never pretend-anonymous.** Hide identity from peers; be honest about what the system keeps.
3.  **Safety is a feature, not an afterthought.** Moderation tools, report thresholds and crisis handling ship in Phase 1, not later.
4.  **Fast on a cheap phone.** Text-first, small bundle, works on weak mobile data, installable without an app store.
5.  **Collect the least we can.** No coordinates stored, no ad trackers, no contacts access, no DMs in v1.

3\. Users
=========

| **Persona** | **Who they are** | **What they need** | **What worries them** |
| --- | --- | --- | --- |
| Efua, Level 100 | Fresh student, new to Accra and UPSA | Quick answers: where to register, how clearance works, safe hostels, cheap food | Looking foolish; scams; being ignored |
| Kojo, Level 400 | Final-year, lives in a hostel off campus, knows the system | Share tips, find lost items, rant safely about queues and logistics | Being identified; being blamed for naming a lecturer |
| Ama, evening/weekend student | Works in the day, on campus at set times | Timetable changes, venue changes, study partners | Missing news that day-time students hear first |
| Moderator | Admin team member or approved student moderator | Fast queue, clear rules, protection from distressing content overload | Wrong calls; burnout; being targeted |

Roles stay minimal, matching the two-role model used across Codey Dev projects: **User** and **Admin**, with explicit flags on a profile (for example can\_moderate, can\_unmask) rather than separate role tiers.

4\. Goals and success measures
==============================

The figures below are starting targets to be validated after a soft launch, not forecasts.

| **Measure** | **Starting target** | **How measured** |
| --- | --- | --- |
| Verified sign-ups | 1,500 within 8 weeks of public launch | Count of active profiles |
| Weekly active share | 30% of verified users | Distinct users posting, replying, or voting per week |
| Speed of help | Median first reply on an Ask under 15 minutes in daytime | Ask created\_at vs first reply |
| Questions resolved | 50% of Asks marked answered or with 3+ replies | Answered flag and reply count |
| Safety response | 95% of priority reports reviewed within the target window | Report resolved\_at vs created\_at |
| Content health | Under 5% of posts held or removed | Moderation actions over posts |
| Retention | 25% of week-1 users still active at day 30 | Cohort query |

5\. Scope
=========

5.1 In scope: Phase 1 (MVP)
---------------------------

*   Email OTP sign-in for allow-listed UPSA addresses, with age confirmation and versioned consent.
*   Zone verification by device location, without storing coordinates.
*   Feed with Hot, New and Top-today sorting; channels; Ask filter.
*   Text posts (500 characters) and flat replies (300 characters) with per-thread aliases.
*   Up/down votes, private karma, auto-hide on heavy downvoting.
*   Reports, keyword pre-screen, admin moderation queue, audit trail.
*   In-app alerts and opt-in Web Push for replies, answers and moderation outcomes.
*   In-app account deletion and a data-request form.
*   Public pages: Terms, Privacy Notice, Community Guidelines, Accessibility Statement.

5.2 Out of scope for Phase 1
----------------------------

| **Item** | **Why it waits** |
| --- | --- |
| Direct messages and group chats | Highest harassment and grooming risk; needs a separate safety design |
| Images, video, voice notes | Needs consent and identifiability rules; EXIF/location stripping applies when added |
| Edit after posting | Prevents bait-and-switch after votes; users can delete their own posts |
| Ads, sponsored posts, payments | No business model in v1; avoids tracker and consent complexity |
| Staff or lecturer accounts | Changes the power dynamic; revisit with UPSA |
| Native Android and iOS apps | PWA first; Expo build considered once usage justifies it |
| Campus Wi-Fi or QR-based presence checks | Possible hardening against GPS spoofing in Phase 3 |

6\. Functional requirements
===========================

| **ID** | **Requirement** | **Priority** |
| --- | --- | --- |
| AUTH-1 | Sign in with email OTP. Only addresses on an admin-maintained allow-list of UPSA domains are accepted \[DECISION D2\]. | Must |
| AUTH-2 | Sign-up requires 18+ confirmation and three separate, unticked checkboxes (Terms, Privacy Notice, Community Guidelines). Document version and timestamp are recorded. | Must |
| AUTH-3 | One trusted device per account. A new device must be approved from the main device or by email confirmation. | Should |
| ZONE-1 | Location is requested only when entering the feed, after a plain-language explanation. | Must |
| ZONE-2 | Server checks the position against the active zone polygon, discards the coordinates, and grants a 15-minute verified window. | Must |
| ZONE-3 | Outside the zone the user sees an explanation screen instead of the feed. | Must |
| FEED-1 | Hot, New and Top (24h) sorts with cursor pagination. | Must |
| FEED-2 | Channel filter and an Asks-only filter. | Must |
| FEED-3 | A new-posts pill driven by realtime events; the list never jumps under the reader. | Should |
| POST-1 | Compose text post up to 500 characters, choose a channel, optionally mark as Ask. | Must |
| POST-2 | No editing after publishing. Authors can delete their own posts. | Must |
| POST-3 | Keyword and pattern pre-screen: matching posts are held for review, others publish immediately. | Must |
| POST-4 | Rate limits per user, starting at 10 posts and 30 replies per hour. | Must |
| REPLY-1 | Flat replies up to 300 characters. Per-thread alias: OP, Student 1, Student 2... stable within a thread, unrelated across threads. | Must |
| REPLY-2 | The asker can mark one reply as the answer on an Ask. | Should |
| VOTE-1 | One vote per item, changeable or removable. No voting on your own content. | Must |
| VOTE-2 | A post whose net score reaches -5 is hidden and queued for review. | Should |
| KARMA-1 | Karma equals net votes on your content and is visible only to you. | Should |
| REPORT-1 | Report any post or reply with a reason and optional note. One report per user per item. | Must |
| REPORT-2 | Auto-hide when reports from distinct users reach 2 for priority reasons or 5 for others (starting values). | Must |
| MOD-1 | Admin queue for held, reported and auto-hidden items with restore, remove, warn, suspend and ban actions. A reason is mandatory and every action is logged. | Must |
| MOD-2 | Content flagged for self-harm triggers a support card pointing to UPSA Guidance and Counselling Unit contacts, once the unit confirms the details \[DECISION D7\]. | Must |
| MOD-3 | Author unmasking exists only as a restricted, two-person, audited capability, disabled until the policy is approved \[DECISION D6\]. | Must |
| NOTIF-1 | In-app alerts for replies, answers and moderation outcomes. Opt-in Web Push for the same events. | Must |
| ACCT-1 | In-app account deletion with a clear statement of what is removed and what remains. | Must |
| ACCT-2 | Data request form for access and correction, tracked to completion. | Must |
| LEGAL-1 | Pages at /terms, /privacy, /community-guidelines, /accessibility; linked from footer, sign-up and settings; re-acceptance flow when a version changes. | Must |
| ADMIN-1 | Admin screens for zone polygon, channels, keyword rules, allow-list domains, and user lookup by post or alias, not by browsing identities. | Should |

7\. Anonymity model
===================

| **Data** | **Other students** | **Moderators** | **Database admin** | **Disclosed only through** |
| --- | --- | --- | --- | --- |
| Post and reply text | Yes | Yes | Yes | n/a |
| Thread alias | Yes | Yes | Yes | n/a |
| Author identity (user id, email) | Never | No | Technically yes | Two-person unmask or legal process |
| Device identifier (hashed) | Never | No | Technically yes | Same as above |
| Location | Never | No | Not stored (only zone and expiry) | Not available |
| Karma | Never | No | Yes | n/a |

<table><tbody><tr><td><strong>Important </strong>Because accounts rest on verified email, the product is pseudonymous. Marketing it as anonymous would be inaccurate and could breach the honesty required of the Privacy Notice.</td></tr></tbody></table>

8\. Moderation and safety policy
================================

| **Category** | **Examples** | **Automatic handling** | **Human review target** |
| --- | --- | --- | --- |
| Self-harm | Statements of intent or hopelessness | Support card shown; item held; priority queue | Within 2 hours, 07:00-23:00 |
| Threat of violence | Threats against a person or group | Hidden at 2 reports; priority queue | Within 2 hours |
| Doxxing | Phone numbers, hostel rooms, index numbers, photos of a named person | Keyword and pattern hold; hidden at 2 reports | Within 2 hours |
| Harassment and hate | Targeted abuse, slurs, body-shaming | Hidden at 5 reports | Within 24 hours |
| Sexual content | Explicit content or solicitation | Keyword hold | Within 24 hours |
| Exam malpractice | Leaked questions, selling answers | Keyword hold | Within 24 hours; heightened during exam weeks |
| Defamatory claims about named people | Unproven accusations against lecturers or students | Reports only; automated detection is unreliable | Within 24 hours |
| Spam and scams | Fake jobs, loans, links | Rate limits; link rules; keyword hold | Within 24 hours |

Review targets depend on moderator availability \[DECISION D5\]. If the team cannot staff the 2-hour window, the product should not launch with open posting; it can launch read-only for moderators and invited testers first.

9\. Non-functional requirements
===============================

| **Area** | **Requirement** |
| --- | --- |
| Performance | First feed paint under 2.5 seconds on a mid-range Android phone over 3G-class data; feed API p95 under 400 ms at expected load |
| Availability | 99% monthly target on free-tier infrastructure with documented upgrade triggers; no cold-start tolerance for moderation actions |
| Security | Row Level Security on every table, author identity unreachable from client APIs, rate limiting on all write routes, bot protection on sign-in |
| Privacy | No coordinates persisted, no third-party ad or tracking scripts, retention schedule enforced by scheduled jobs |
| Accessibility | WCAG 2.1 AA target, 44 px touch targets, full keyboard and screen reader support |
| Compatibility | Current and previous major versions of Chrome and Safari on Android and iOS; installable PWA |
| Scalability | Designed for tens of thousands of verified users, thousands of concurrent |
| Auditability | Append-only moderation and unmask records |

10\. Legal and compliance summary
=================================

The full assessment, with classification of every candidate document, is in the Workflow document. In short: the app processes personal data (email, device hash, consent records, user-generated content) of students in Ghana, so the Ghana Data Protection Act, 2012 (Act 843) must be assessed, including registration with the Data Protection Commission and breach-notification duties. Whether Codey Dev or UPSA is the data controller is unresolved \[DECISION D1\]. Every statutory reference in this suite is flagged for verification by a qualified Ghanaian lawyer before launch.

11\. Business model
===================

None in Phase 1. The product is free for students. Running cost is small on free-tier infrastructure (see TDD upgrade triggers). If sustainability is needed later, options in order of least conflict with the privacy promise are: a university or SRC sponsorship, grant funding, or clearly labelled sponsor posts from campus bodies. Behavioural advertising is excluded.

12\. Risks
==========

| **Risk** | **Impact** | **Mitigation** |
| --- | --- | --- |
| Cyberbullying or toxic culture | High | Strict Community Guidelines, fast hides, report thresholds, suspensions, visible rules at sign-up |
| Defamation of lecturers or students | High | Report path, quick removal, clear Terms, institutional escalation route |
| Exam leaks during exam weeks | Medium | Keyword hold, heightened moderation schedule, UPSA liaison |
| GPS spoofing to enter the zone | Medium | Device trust, rate limits, report-driven bans; harden with campus QR or Wi-Fi later |
| Empty feed at launch | High | Launch during orientation or a busy week, seed Ask prompts through moderators, channel-by-channel opening |
| University objects to the product or name | High | Seek approval early; neutral name until approved \[D1\] |
| Pseudonymity misunderstood | Medium | Plain-language onboarding statement of what is kept |
| Moderator burnout or absence | High | Rotation, content-exposure limits, auto-hide, launch gate on staffing \[D5\] |
| Free-tier project pause or limits | Medium | Keep-alive job, upgrade triggers, alerting |
| Single-developer bus factor | Medium | This documentation suite, scripted migrations, runbooks |

13\. Open decisions
===================

| **ID** | **Decision** | **Default assumed in this suite** |
| --- | --- | --- |
| D1 | Who is the data controller and brand owner? Is UPSA or the SRC an official partner? | Codey Dev builds; a formal sponsor is sought; no UPSA crest until approved |
| D2 | Verification method: UPSA email domains, or student index number check | Email OTP on allow-listed UPSA domains; domains to be confirmed |
| D3 | Zone boundary and surrounding area included | Polygon around main campus plus nearby hostel belts; set in admin, to be surveyed |
| D4 | Minimum age and handling of under-18 students | 18+ confirmation at sign-up; verify legal position |
| D5 | Moderation staffing and hours | Two admins plus up to four trained student moderators |
| D6 | Who may unmask, and under what conditions | Two named holders, written legal request or credible threat, UPSA disciplinary referral |
| D7 | Counselling unit contact details for the support card | Placeholder until the unit confirms |
| D8 | Retention periods | Posts archived after 30 days, deleted after 12 months; reports 24 months |
| D9 | Final product name | UPSA Pulse is a placeholder |

14\. Release plan
=================

| **Phase** | **Focus** | **Exit condition** |
| --- | --- | --- |
| 0 Foundations | Repo, Supabase project, schema, auth, CI, zone data | RLS tests pass; sign-in works end to end |
| 1 MVP build | Feed, posts, replies, votes, reports, moderation, legal pages | All Must requirements demo-able on staging |
| 2 Closed beta | 50-150 invited students, moderators trained | Safety targets met for 2 weeks; no open Sev-1 issues |
| 3 Public launch | Campus-wide, announcement during a busy week | Launch checklist signed off |
| 4 Growth | Images, polls, campus-event channel, spoofing hardening, optional Expo app | Based on usage and moderation load |