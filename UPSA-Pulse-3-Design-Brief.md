**UPSA PULSE · WORKING TITLE**  
**Design Brief**  
Look, feel, tokens and screen inventory in UPSA Blue and Gold

| **Field** | **Detail** |
| --- | --- |
| Project | Jodel-style, location-gated, pseudonymous campus feed for UPSA students |
| Document | Design Brief |
| Version | 1.0 (draft for review) |
| Date | 17 October 2026 |
| Prepared by | Codey Dev (Aka Brown) |
| Status | Draft. Colour palette is a proposal pending sampling from official UPSA artwork. Items marked \[DECISION\] need an owner answer before build. Legal points are flagged for verification and are not legal advice. |

1\. Design intent
=================

Think of the notice board outside the faculty block at 8 a.m.: crowded, quick to scan, a bit chaotic, but everyone reads it because it is where things happen. UPSA Pulse should feel like that board made calm. It uses UPSA Blue and UPSA Gold, so it looks like it belongs to the university community, but it does not copy a corporate banking look or a generic social-app template.

1.1 Design principles
---------------------

1.  **Readable first.** Used outdoors, on cracked screens and small phones. Contrast and type size win over decoration.
2.  **Text is the content.** No avatars or photos, so the interface gives its space to words and to the people replying.
3.  **Fast to ask.** Composing a question is at most two taps from anywhere in the feed.
4.  **Obvious rules.** Safety and honesty copy appear where decisions happen, not in a hidden page.
5.  **Quiet motion.** Motion confirms an action. It never performs for its own sake.

2\. Colour
==========

<table><tbody><tr><td><strong>Proposal </strong>UPSA's own brief for its 60th anniversary logo names UPSA Blue and UPSA Gold as the official primary colours. The exact hex values below are a proposal made without the official artwork. They must be sampled from the approved logo files before build, and replaced here if they differ.</td></tr></tbody></table>

2.1 Primitive tokens
--------------------

| **Token** | **Hex** | **Use** |
| --- | --- | --- |
| navy-950 | #071C3D | Dark-mode background layers, deepest headers |
| navy-900 | #0B2A5B | Primary brand colour: top bar, primary buttons, headings |
| navy-700 | #1C4A8F | Links, secondary emphasis, pressed state of primary |
| navy-100 | #DCE6F5 | Selected chips, hover surfaces |
| navy-50 | #EEF2F8 | Zebra rows, subtle panels, code areas |
| gold-500 | #D9A21B | Accent fill: OP chip, Ask badge, focus ring, highlights |
| gold-700 | #8A6200 | Gold used as text on light backgrounds |
| gold-100 | #FBF3DC | Callouts, answered-state background |
| ink | #1B2433 | Body text |
| slate-600 | #5B6678 | Secondary text, timestamps |
| line | #D5DAE3 | Borders and dividers |
| bg | #F7F8FB | App background (light) |
| white | #FFFFFF | Cards and sheets |
| danger | #A32121 | Destructive actions, errors, report |
| success | #1F7A4D | Answered tick, saved confirmations |

2.2 Semantic tokens (light and dark)
------------------------------------

| **Role** | **Light** | **Dark** |
| --- | --- | --- |
| surface/app | bg #F7F8FB | #0C1424 |
| surface/card | white #FFFFFF | #111A2B |
| text/primary | ink #1B2433 | #E8ECF4 |
| text/secondary | slate-600 #5B6678 | #9AA6BA |
| brand/primary | navy-900 | navy-700 fill with white text |
| accent | gold-500 fill, navy text on top | gold #E8B93C |
| border | line #D5DAE3 | #243350 |
| focus ring | gold-500 with 2 px navy offset | gold #E8B93C |

2.3 Contrast rules (measured)
-----------------------------

| **Pairing** | **Ratio** | **Rule** |
| --- | --- | --- |
| navy-900 on white | 14.0 : 1 | Pass. Default text-on-light for headings |
| ink on bg | 14.7 : 1 | Pass. Body text |
| slate-600 on white | 5.8 : 1 | Pass for normal text |
| gold-500 on navy-900 | 6.1 : 1 | Pass. Gold accents on the top bar |
| navy-900 on gold-500 | 6.1 : 1 | Pass. Text inside gold chips and buttons |
| gold-500 on white | 2.3 : 1 | FAIL. Never use gold as text or icon on white. Use gold-700 (5.5 : 1) or a fill with navy text |
| gold-700 on white | 5.5 : 1 | Pass for gold-coloured text |
| danger on white | 7.5 : 1 | Pass |
| dark text on dark surface | 14.7 : 1 | Pass. Gold #E8B93C on dark surface 9.5 : 1 |

**Channel identity:** channels are told apart by an icon and label, not by a rainbow of colours. Colour is never the only carrier of meaning, which also helps colour-blind users and keeps the app on-brand.

3\. Typography
==============

| **Role** | **Specification** |
| --- | --- |
| Family | Figtree (variable, subset to Latin) with system-ui fallback. One family keeps the page weight small on mobile data. |
| Body | 16 px / 24 px, weight 400. Post text 16 px so it stays legible without zoom. |
| Meta | 13 px / 18 px, slate-600 (timestamps, channel tag, reply count) |
| Card title or channel name | 15 px, weight 600 |
| Screen title | 22 px / 28 px, weight 700, navy-900 |
| Buttons | 15 px, weight 600, sentence case |
| Character counter | 13 px, turns danger colour in the last 20 characters |

4\. Layout and navigation
=========================

*   Mobile-first at 360 px width. Content column maxes at 640 px on larger screens, centred, with the same single-column feed.
*   Top bar (navy-900): zone name, sort tabs (Hot, New, Top), overflow menu. Gold underline marks the active tab.
*   Bottom navigation, five items: Feed, Channels, Compose (centre, gold fill, navy plus icon), Alerts, Me. Touch targets at least 44 px.
*   Safe-area insets respected for notched phones and installed PWA mode.

4.1 Post card anatomy
---------------------

| **Zone** | **Content** | **Notes** |
| --- | --- | --- |
| Left rail | Up arrow, net score, down arrow | Vertical stack, 44 px wide. Voted state uses navy fill and a text label for screen readers |
| Header | Channel icon and name, relative time | Time is relative (3 min), absolute on long-press |
| Body | Post text, up to 500 characters | Truncated at 6 lines with Read more |
| Footer | Reply count, report overflow | Ask posts show a gold Ask badge and either Open or Answered (gold-100 background, success tick) |

4.2 Thread and aliases
----------------------

Replies are a flat list. Each reply shows an alias chip: **OP** in gold with navy text, others as Student 1, Student 2 in navy-100 with navy text. A small geometric glyph, generated from the alias number within that thread only, sits beside the chip. The glyph set is abstract shapes in navy and gold; no faces and no stable colours across threads, so users cannot be linked between threads. The accepted answer is pinned to the top with a gold-100 band.

4.3 Compose
-----------

*   Full-screen sheet: channel selector (chips), text area with live counter, Ask toggle with one line explaining what it does.
*   Before sending, a one-line reminder: Others cannot see your name. UPSA Pulse can. Link to Community Guidelines.
*   Held posts show a neutral message (Your post is being checked) rather than naming the rule that triggered.

5\. Screen inventory
====================

| **Screen** | **Purpose** | **Key components** |
| --- | --- | --- |
| Welcome and how it works | 3 short cards: local, pseudonymous, rules | Progress dots, Continue, link to Privacy |
| Sign-up and consent | Email, age confirmation, three separate unticked consents | Checkboxes with links, disabled button until all ticked |
| OTP | Enter 6-digit code | Single input with resend timer |
| Location explainer | Why location is needed, what is not stored | Allow button, Not now link |
| Outside zone | Explain zone, offer retry | Illustration-free message, Retry, How zones work link |
| Feed | Main list | Sort tabs, cards, new-posts pill, skeletons |
| Channels | Browse channels | List with icons and short descriptions |
| Compose | Write a post | Described above |
| Thread | Post plus replies | Alias chips, reply box pinned at bottom, answer action for asker |
| Alerts | In-app notifications | Grouped list, mark all read, push opt-in banner |
| Me | Karma (private), settings, legal links, delete account | Danger zone separated and confirmed |
| Report sheet | Choose reason, optional note | Radio list with plain explanations |
| Support card | Shown for self-harm related flags | Calm layout, counselling contacts once confirmed |
| Legal pages | Terms, Privacy, Guidelines, Accessibility | Readable long-form layout with last-updated and version |
| Admin queue (desktop-first) | Moderate held and reported items | Table, preview, action bar with mandatory reason |

6\. States
==========

| **State** | **Treatment** |
| --- | --- |
| Loading | Skeleton cards, no spinners over content |
| Empty feed | Short invitation to ask the first question, with two example Asks |
| Offline | Top banner Offline, showing last loaded items; write actions disabled with explanation |
| Rate limited | Friendly wait message with the time remaining |
| Outside zone | Dedicated screen, not an error toast |
| Suspended or banned | Plain message with the reason category, expiry if any, and an appeal link |
| Held or hidden own post | Neutral status label on the author's own thread only |
| Error | Short plain message, Retry, no stack traces or codes shown |

7\. Motion
==========

*   Vote press: 120 ms scale and fill change. New-posts pill: slides in once, no bounce.
*   No scroll-triggered fade-ins, parallax, cursor effects or decorative loops.
*   Respect prefers-reduced-motion by removing all transforms.

8\. Accessibility
=================

*   Target WCAG 2.1 AA. Text contrast per section 2.3, 44 px touch targets, visible gold focus ring.
*   Vote buttons announce their action and state, for example: Upvote, current score 12, not selected.
*   Alias chips are text, so screen readers read OP or Student 3. Glyphs are decorative and hidden from assistive tech.
*   Forms have visible labels, inline errors tied with aria-describedby, and logical focus order.
*   Support 200% text zoom without horizontal scrolling.

9\. Voice and microcopy
=======================

Plain English that a first-year in Accra would use, friendly but not slangy. Avoid heavy idiom so it stays clear for all students. Examples:

| **Where** | **Copy** |
| --- | --- |
| Empty feed | Nothing here yet. Ask something, someone near you probably knows. |
| Compose reminder | Other students can't see your name. We can, and we can act if someone is harmed. |
| Outside zone | Pulse only works on and around the UPSA campus. Move closer and try again. |
| Held post | Your post is being checked. It will appear soon if it follows the guidelines. |
| Delete account | This removes your account and sign-in. Your past posts stay, with no link to you. |

10\. Brand and logo
===================

*   A neutral wordmark in Figtree Bold with a small gold pin mark is used until naming and endorsement are settled \[D1, D9\].
*   The UPSA crest and logo are not used without written permission from the university. Until then the footer states that the app is independent.
*   Favicon and PWA icon: navy-900 tile, gold pin glyph, tested at 192 and 512 px and as a maskable icon.

11\. Anti-generic checklist
===========================

| **Avoid** | **Instead** |
| --- | --- |
| Gradient blobs and glass cards as default surfaces | Flat navy, white and tint surfaces with 1 px borders |
| Uniform pill buttons everywhere | Rectangular 8 px radius primary buttons; pills only for chips |
| Fade-in on every scroll section | Static layout, motion only on user actions |
| Decorative italic serif accents on a sans UI | One family, weight and size carry hierarchy |
| Stock avatars or emoji faces for users | Thread-local geometric glyphs and alias text |
| Rainbow channel colours | Icons and labels in the brand palette |
| Overused Space Grotesk plus Instrument Serif pairing | Figtree alone |

12\. Figma handoff
==================

*   Create the Primitives variable collection first with scopes set to none, then the semantic Color collection aliasing to primitives (light and dark modes).
*   Starter plan limits: at most three pages and a cap on MCP write calls, so use Sections within pages (Foundations, Components, Screens) and batch writes into few large calls.
*   Components to build first: top bar, bottom nav, post card (states: default, voted up, voted down, Ask open, Ask answered, held), alias chip, compose sheet, report sheet, banner, skeleton card.
*   Prototype flows: onboarding to first post; Ask to accepted answer; report to hide.