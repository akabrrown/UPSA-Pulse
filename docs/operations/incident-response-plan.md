# UPSA Pulse — Incident Response Plan (IRP)

**Effective Date:** 4 November 2026  
**Document Version:** 1.0  
**Compliance Alignment:** `UPSA-Pulse-6-Workflow-and-Compliance.md` (Section 6) & Ghana Data Protection Act, 2012 (Act 843)

---

## 1. Severity Classification & Response Targets

| Severity | Definition | Containment Target | Resolution / Notification Target |
|---|---|---|---|
| **Sev-1 (Critical)** | Credible threat of violence on campus, active self-harm emergency, mass doxxing of student PII, or unauthorized access to `private.*` tables. | **<= 1 hour** | Immediate containment; Data Protection Commission (DPC) & affected students notified within statutory window if personal data is breached. |
| **Sev-2 (High)** | Coordinated harassment campaign, exam paper leak flood, bypass of rate limits or zone verification, or moderation queue outage. | **<= 4 hours** | Mitigated within 12 hours; post-incident review within 48 hours. |
| **Sev-3 (Moderate)** | Non-critical bug in feed sorting, delayed Web Push delivery, or isolated spam wave caught by hold rules. | **<= 24 hours** | Resolved in standard release cycle. |

---

## 2. Five-Step Incident Response Workflow

1. **Detect & Triage:**
   - Triggered via Sentry error alert, P1 report surge (`self_harm`, `threat_of_violence`, `doxxing`), or anomaly in `private.audit_logs`.
   - On-call Incident Lead assigns severity (`Sev-1`, `Sev-2`, or `Sev-3`) within 15 minutes.
2. **Contain (Target <= 1 Hour for Sev-1):**
   - For content emergencies: immediately hide/remove target posts via `/admin` (`private.apply_moderation_action`) and add an emergency regex/keyword hold rule in `private.keyword_rules`.
   - For account/credential compromise: revoke sessions, rotate `SUPABASE_SERVICE_ROLE_KEY` and `DEVICE_PEPPER`, or disable write RPCs temporarily.
3. **Assess Personal Data Impact (Act 843 Gate):**
   - Inspect `private.audit_logs` and `private.unmask_requests` to determine whether any rows in `private.profiles`, `private.devices`, or `private.thread_aliases` were exposed.
4. **Notify (When Required by Ghana Act 843):**
   - If a breach of personal data creates a risk to data subjects, notify the **Data Protection Commission (Ghana)** and affected UPSA students in plain language stating:
     - What occurred and when
     - Categories of data involved (`email`, account metadata; note that GPS coordinates are never stored)
     - Steps taken to contain the breach and how students can protect themselves
5. **Post-Incident Review (Within 72 Hours):**
   - Document root cause, timeline, and preventative SQL/application controls in an immutable post-mortem report.

