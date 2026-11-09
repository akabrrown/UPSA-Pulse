**UPSA PULSE · WORKING TITLE**  
**App Flow**  
Every journey, screen transition and edge case

| **Field** | **Detail** |
| --- | --- |
| Project | Jodel-style, location-gated, pseudonymous campus feed for UPSA students |
| Document | App Flow |
| Version | 1.0 (draft for review) |
| Date | 17 October 2026 |
| Prepared by | Codey Dev (Aka Brown) |
| Status | Draft. Colour palette is a proposal pending sampling from official UPSA artwork. Items marked \[DECISION\] need an owner answer before build. Legal points are flagged for verification and are not legal advice. |

1\. Actors and access
=====================

| **Actor** | **Description** | **Can do** |
| --- | --- | --- |
| Visitor | Not signed in | Read public legal pages and the landing page only |
| User, unverified zone | Signed in, not currently inside the zone | Manage own account, settings, deletion, data requests, alerts history |
| User, in zone | Signed in with an open 15-minute zone window | Read feed, post, reply, vote, report, mark answers on own Asks |
| Suspended or banned user | Restricted by moderators | See status and appeal; no feed access |
| Moderator (flag can\_moderate) | Reviews queue; sees aliases only | Restore, remove, warn, suspend, ban with reason |
| Admin (is\_admin) | Configuration owner | Zones, channels, keyword rules, allowed domains, moderator flags |
| Unmask holder (flag can\_unmask) | Two named people, disabled until policy approved | Initiate or approve an author unmask under policy |

2. Primary flows
=================

First-time onboarding
---------------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | User | Opens the site or installed PWA and sees the welcome cards (local, pseudonymous, rules). | Skip is allowed after the first card; the consent screen cannot be skipped |
| 2 | User | Taps Get started, enters UPSA email address. | Domain not allow-listed: message explaining accepted domains and a support link |
| 3 | System | Rate-limits and sends a 6-digit OTP via Auth. | Too many requests: wait message with timer |
| 4 | User | Confirms they are 18 or over and ticks three separate boxes: Terms, Privacy Notice, Community Guidelines. None is pre-ticked. | Under 18 or any box unticked: Continue stays disabled |
| 5 | User | Enters OTP. | Wrong code 5 times: lock for 15 minutes. Expired: resend |
| 6 | System | Creates profile; stores consent records with document version and timestamp; registers the device as trusted. | Consent write fails: account is not activated, user retries |
| 7 | User | Sees the location explainer and taps Allow. | Not now: lands on the outside-zone screen with a retry button |
| 8 | System | Runs zone verification, then opens the feed with a short tip about Asks and the rules. | See Zone verification |

Returning sign-in and device approval
-------------------------------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | User | Opens app. A valid session goes straight to zone verification. Otherwise enters email and OTP. | Session revoked: back to sign-in |
| 2 | System | Checks the device token against trusted devices. | Unknown device: show Approve this device screen |
| 3 | System | Sends an alert to the trusted device and an approval email link. | No access to the old device: email link only; link expires in 30 minutes |
| 4 | User | Approves from the old device or the email link. | Denied: new device is blocked and a security notice is raised |
| 5 | System | Moves trust to the new device and revokes the old device session. | Repeated switching within 24 hours is rate-limited |

Zone verification
-----------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | System | On feed entry or when the 15-minute window is close to expiry, the client requests device location. | Permission denied: outside-zone screen with Open settings guidance |
| 2 | Client | Sends latitude, longitude and accuracy to the server once. | Network failure: retry with backoff; feed shows offline banner |
| 3 | Server | Rejects if accuracy is worse than the limit, then tests the point against the zone polygon. | Poor accuracy: ask the user to move outdoors or retry |
| 4 | Server | Inside: stores zone id and expiry only, discards coordinates, returns success. | Outside: returns not\_in\_zone |
| 5 | Client | Shows the feed on success, or the outside-zone screen on not\_in\_zone. | Window expires mid-compose: draft is kept locally and re-verification is attempted before send |

Browse the feed
---------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | User | Lands on Hot. Switches to New or Top using the top tabs. | Empty result: invite to post the first question |
| 2 | User | Filters by channel or Asks only. | Channel disabled by admin: it disappears from the list |
| 3 | System | Loads 20 items per page by cursor; infinite scroll loads the next page. | Duplicates from shifting Hot scores are removed by id |
| 4 | System | Realtime event arrives: show New posts (n) pill; tapping it refreshes the top of the list. | Pill never auto-inserts items under the reader |
| 5 | User | Taps a card to open the thread. | Item removed meanwhile: thread-unavailable message |

Create a post or Ask
--------------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | User | Taps Compose, picks a channel, types up to 500 characters, optionally turns on Ask. | Over limit: counter turns red, Send disabled |
| 2 | User | Reads the one-line reminder (identity visible to us, not to students) and taps Post. | Window expired: silent re-verify then retry |
| 3 | Server | Validates input, applies rate limit, calls the create-post function. | Rate limited: wait message |
| 4 | Database | Zone window checked; keyword pre-screen runs; post set to published or held; OP alias created. | Zone not verified: error code zone\_not\_verified |
| 5 | System | Published: appears in the feed and a realtime event is broadcast. Held: author sees neutral Being checked label. | Held post approved later: author gets an alert |

Open a thread and reply
-----------------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | User | Opens a thread; sees the post, any accepted answer pinned, then replies by newest or oldest. | Post hidden or removed: unavailable message |
| 2 | User | Types a reply up to 300 characters and sends. | Over limit or rate limit as above |
| 3 | Database | Allocates the alias under a row lock: existing alias reused, new users get the next Student number, the author is OP. | Concurrent first replies each receive different numbers |
| 4 | System | Increments reply count, updates last activity, notifies the post author. | Author deleted account: no notification is sent |

Vote
----

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | User | Taps up or down arrow. The UI updates optimistically. | Failure: revert and show a short error |
| 2 | Server | Upserts the vote; tapping the same arrow again removes it. Own content rejects votes. | Rate limit exceeded: revert |
| 3 | Database | Trigger updates counts and the author karma; at net score -5 a post is hidden and queued. | Hidden post stays visible to its author with a neutral label |

Accept an answer
----------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | Asker | On an Ask, taps Mark as answer on one reply. | Only the original author, only once at a time |
| 2 | System | Sets answered reply id, shows Answered badge, pins the reply, alerts the reply author. | Changing the answer replaces the previous one |

Report
------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | User | Opens the overflow menu on a post or reply and picks Report. | Already reported: show Already reported |
| 2 | User | Chooses a reason, adds an optional 300-character note, submits. | Cancel keeps the item unchanged |
| 3 | Database | Stores one report per user per item; counts distinct reporters; auto-hides at 2 for priority reasons or 5 for others. | Self-harm reason also triggers the support-card logic for the author thread |
| 4 | System | Adds the item to the moderation queue with priority. | Reporter gets an alert when action is taken (outcome only) |

Moderation
----------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | Moderator | Opens the queue sorted by priority then age. Sees post text, alias, channel, report reasons and counts. No identity. | Queue empty: message with last-cleared time |
| 2 | Moderator | Chooses Restore, Remove, Warn author, Suspend (1, 7 or 30 days) or Ban. A reason is required. | Missing reason: action disabled |
| 3 | System | Writes an append-only moderation record, applies the status change, notifies author and reporters (outcome only). | Two moderators acting on one item: second sees the updated state |
| 4 | Moderator | Escalates serious cases (threats) to the admin using the escalation procedure in the Workflow document. | Escalation out of hours: on-call admin contacted |

Alerts and push
---------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | User | Opens Alerts. A banner offers push notifications. | iOS and not installed: banner explains Add to Home Screen first |
| 2 | User | Accepts the browser permission. | Denied: banner hidden; in-app alerts continue |
| 3 | System | Sends push for replies, answers and moderation outcomes only. | Expired subscription: removed on delivery failure |

Delete account
--------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | User | Me, Delete account. Reads what is removed (profile, devices, votes, alerts, sign-in) and what remains (past posts with no link to the user; legal records). Can provide an optional deletion reason. | Cancel returns to Me |
| 2 | User | Confirms by typing DELETE and a fresh OTP. | Wrong OTP: stay on screen |
| 3 | System | Deletes profile data and Auth user; sets author\_id to null on posts and replies; signs out all sessions. | Pending moderation case: record retained under retention rules and the user is told |
| 4 | System | Shows a confirmation screen and sends a final email (no re-activation link). | Re-signing up later creates a new account with no history |

Data request (access or correction)
-----------------------------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | User | Me, Privacy, Data request. Chooses Access or Correction and describes it. | Rate-limited to prevent flooding |
| 2 | System | Creates a request record with due date and emails a receipt. | Identity confirmed by sign-in session |
| 3 | Admin | Prepares the export or correction per the Workflow procedure and marks complete. | Overdue requests surface on the admin dashboard |

Legal update and re-acceptance
------------------------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | Admin | Publishes a new version of a legal document and sets its effective date. | Material change: summary of changes is required |
| 2 | User | On next sign-in sees a blocking sheet with the summary and links to the full text; ticks acceptance. | Declines: can still delete account or export data, but cannot use the feed |
| 3 | System | Records the new version and timestamp. | Failure leaves the old consent state |

Suspension, ban and appeal
--------------------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | System | Applies suspension or ban; user sees the status screen on next open. | Reason category shown, not other users' reports |
| 2 | User | Submits an appeal with a short message. | One open appeal at a time |
| 3 | Admin | A different moderator than the original reviews and decides. | Decision logged and communicated |

Unmask (restricted)
-------------------

| **#** | **Actor** | **Step** | **Failure or edge case** |
| --- | --- | --- | --- |
| 1 | Holder A | Opens an unmask request for a specific post, selecting a basis (legal request, credible threat, UPSA disciplinary referral) and attaching the reference. | Feature disabled until policy approval \[D6\] |
| 2 | Holder B | Reviews independently and approves or rejects. | Same person cannot be both holders |
| 3 | System | On approval, returns the account identity to the requesting holders only and writes an audit record with reasons. | Every access is permanent in the audit log |
| 4 | Admin | Discloses to the authorised recipient through the disclosure procedure. | No disclosure without the documented basis |

3\. Screen navigation map
=========================

| **From** | **Can go to** |
| --- | --- |
| Welcome | Sign-up and consent, Privacy Notice |
| Sign-up and consent | OTP, Terms, Privacy, Community Guidelines |
| OTP | Location explainer, Approve this device |
| Location explainer | Feed, Outside zone |
| Outside zone | Retry (to location check), How zones work, Me |
| Feed | Thread, Compose, Channels, Alerts, Me, Report sheet |
| Channels | Feed (filtered by channel) |
| Compose | Feed (on send), discard confirm |
| Thread | Reply box, Report sheet, Feed |
| Alerts | Thread, Me, push settings |
| Me | Settings, Legal pages, Data request, Delete account, Appeal (if restricted) |
| Support card | Counselling contacts, back to Feed |
| Admin queue | Item detail, Config, Audit view |

4\. State machines
==================

### Post status

| **From** | **Event** | **To** |
| --- | --- | --- |
| (new) | Pre-screen clear | published |
| (new) | Pre-screen match | held |
| held | Moderator restores | published |
| held | Moderator removes | removed |
| published | Net score at or below -5, or report threshold met | hidden |
| hidden | Moderator restores | published |
| hidden | Moderator removes | removed |
| published | Author deletes | removed |
| published | Age over 30 days | archived |
| removed, archived | Retention period ends | deleted from database |

### User status

| **From** | **Event** | **To** |
| --- | --- | --- |
| active | Moderator suspends | suspended (timed) |
| suspended | Time elapses or appeal upheld | active |
| active, suspended | Admin bans | banned |
| banned | Appeal upheld by a second reviewer | active |
| any | User deletes account | deleted |

5\. Notification catalogue
==========================

| **Event** | **In-app** | **Push (opt-in)** | **Content rule** |
| --- | --- | --- | --- |
| New reply on your post | Yes | Yes | Shows the alias and first 80 characters of the reply |
| Your reply marked as answer | Yes | Yes | Names the post, not a person |
| Your held post approved | Yes | Yes | Neutral message |
| Your post removed or hidden | Yes | Yes | Category of rule, link to Guidelines |
| Your report was actioned | Yes | No | Outcome only |
| Suspension or ban | Yes | No | Duration and appeal link |
| Legal document updated | Yes | No | Summary and action required |
| Data request status | Yes | No | Receipt and completion |

6\. Edge-case matrix
====================

| **Situation** | **Behaviour** |
| --- | --- |
| User leaves campus mid-session | Window expires within 15 minutes; feed replaced by outside-zone screen; drafts kept locally |
| Two devices open at once | Only the trusted device may hold a live session |
| Thread author deletes the post | Thread removed for everyone; replies are not recoverable |
| A reply is reported but the post is fine | Only the reply is hidden; post remains |
| Exam week surge | Lower hold thresholds enabled by admin; moderation hours extended |
| Zone polygon changes | New polygon applies at next verification; no retroactive effect on past posts |
| User changes UPSA email | Treated as a new account in Phase 1; no merge of history |
| Moderator is also a normal user | Cannot moderate content from threads they participated in |