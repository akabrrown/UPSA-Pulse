# UPSA Pulse — Law Enforcement & Emergency Disclosure Procedure

**Effective Date:** 4 November 2026  
**Document Version:** 1.0  
**Compliance Alignment:** `UPSA-Pulse-6-Workflow-and-Compliance.md` (Section 5, MOD-3, Flow F16, Decision `[D6]`)

---

## 1. Default Policy Gate (`[DECISION D6]`)

- Author unmasking is **disabled in production by default** (`UNMASK_ENABLED=false`).
- Even when enabled following written legal sign-off, **no single administrator or moderator** can view or query the relationship between a post/reply and `private.profiles.email`.

---

## 2. Mandatory Two-Person Rule (`private.unmask_requests`)

Any disclosure of an author's identity requires **two distinct authorized holders** (`can_unmask = true` on `private.profiles`):

1. **Step 1 — Formal Request by Holder A:**
   - Holder A verifies the formal written instrument and submits an unmask request via `POST /api/admin/unmask` (`action: 'request'`) with:
     - `postId`: UUID of the specific post under formal investigation
     - `basis`: Must be one of `legal_request`, `credible_threat`, or `upsa_disciplinary_referral`
     - `reference`: Court order, warrant number, or official emergency case reference
     - `reason`: Detailed written justification (minimum 10 characters)
   - The request is recorded with `status = 'pending'` and writes an immutable entry to `private.audit_logs`.

2. **Step 2 — Independent Verification & Approval by Holder B:**
   - Holder B (where `approved_by != requested_by`, enforced both by PostgreSQL `CHECK (approved_by is null or approved_by <> requested_by)` and application validation) independently reviews the legal instrument.
   - If valid, Holder B executes `POST /api/admin/unmask` (`action: 'approve'`).
   - Only upon Holder B's approval does the system disclose the minimal account record (`userId`, `email`) for that specific post and log `unmask_approved_and_disclosed` in `private.audit_logs`.

---

## 3. Scope Limitation

- Unmasking applies **strictly to the single `post_id`** specified in the approved request.
- Bulk export of `private.thread_aliases` or cross-thread correlation of a user's activity is prohibited.

