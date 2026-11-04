# UPSA Pulse — Moderator Manual & Code of Conduct

**Effective Date:** 4 November 2026  
**Document Version:** 1.0  
**Compliance Alignment:** `UPSA-Pulse-6-Workflow-and-Compliance.md` (Sections 5 & 8)

---

## 1. Core Principles & Confidentiality

1. **Aliases Only:** Moderators see only thread aliases (`OP`, `Student 1`, `Student 2`) and case lookup histories. Moderators never see student email addresses and must never attempt to guess, correlate, or unmask a student's identity.
2. **Conflict-of-Interest Ban (Database-Enforced):**
   - If a moderator has posted or replied in a thread (i.e. has a row in `private.thread_aliases` for that `post_id`), PostgreSQL (`private.apply_moderation_action`) and the Admin UI block that moderator from taking any moderation action on that thread (`conflict_of_interest`).
3. **Two-Moderator Appeal Rule (Database-Enforced):**
   - When a student appeals a content removal, suspension, or ban (`feed.submit_appeal`), PostgreSQL (`private.decide_appeal`) blocks the moderator who issued the original action from deciding the appeal (`same_moderator_cannot_review_appeal`).
4. **Mandatory Written Reason:**
   - Every moderation action (`restore`, `remove`, `warn`, `suspend`, `ban`, `unban`, `dismiss_report`) requires a clear reason (`>= 5` characters) and writes an append-only row to `private.moderation_actions`.

---

## 2. Service Level Targets (SLAs)

- **P1 Priority Queue (`self_harm`, `threat_of_violence`, `doxxing`, phone-number regex hold):**
  - Target response: **<= 2 hours** between **07:00 and 23:00 GMT** (7 days/week).
  - Auto-hide trigger: **2 distinct P1 reports** immediately hide the item (`status = 'hidden'`) pending moderator review.
- **P2 Standard Queue (`harassment`, `hate`, `exam_leak`, `false_claim`, `spam`, `other`, `-5` net score):**
  - Target response: **<= 24 hours**.
  - Auto-hide trigger: **5 distinct reports** across any reason or net vote score `<= -5`.

---

## 3. Exam-Week Surge Protocol

During UPSA mid-semester and final examination periods:
1. Activate heightened keyword hold patterns for course codes and leaked paper phrases in `/admin`.
2. Ensure at least **two active moderators** are on shift overlap during peak hours (07:00–23:00) so conflict-of-interest threads and appeals can be handled without delay.

