import { LegalDocumentLayout } from '@/components/legal/LegalDocumentLayout';

export const metadata = {
  title: 'Terms of Service · UPSA Pulse',
};

export default function TermsPage() {
  return (
    <LegalDocumentLayout
      title="Terms of Service"
      version="1.0"
      effectiveDate="17 October 2026"
      summary="These terms govern your access to UPSA Pulse, explain our pseudonymous safety model, and set the rules for posting, moderation, and account suspension."
    >
      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          1. Independent status and eligibility
        </h2>
        <p>
          UPSA Pulse is an independent, location-gated campus feed operated for verified students.
          Unless formally endorsed in writing, it is not an official administrative channel of the
          University of Professional Studies, Accra (UPSA). You must be an enrolled UPSA student
          holding an active student index number and allow-listed university email to create an account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          2. Pseudonymous participation — not untraceable anonymity
        </h2>
        <p>
          Other students see only your per-thread alias (for example, <strong>OP</strong> or{' '}
          <strong>Student 1</strong>). However, your account is linked to your verified UPSA email
          and a hashed device token so we can act against abuse. Identity may be disclosed only
          through our restricted two-person unmask procedure under a valid legal request, a
          credible imminent threat to life or safety, or an official UPSA disciplinary referral.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          3. User content and licence
        </h2>
        <p>
          You retain ownership of the text you post. By submitting a post or reply, you grant UPSA
          Pulse a non-exclusive, royalty-free licence to display, distribute, archive, and moderate
          that content within the service in accordance with our retention schedule. Posts cannot
          be edited after publishing; you may delete your own posts at any time.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          4. Moderation, suspensions, and appeals
        </h2>
        <p>
          Content that breaches our Community Guidelines may be held by automated pre-screening,
          hidden when report or downvote thresholds are reached, or removed by moderators. Serious
          or repeated breaches result in a timed suspension (1, 7, or 30 days) or a permanent ban.
          You may submit one appeal at a time from your account status screen, which is reviewed by
          a different moderator than the one who applied the restriction.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          5. Takedown complaints (defamation, privacy, copyright)
        </h2>
        <p>
          Posts reflect the views of individual students and are not academic, legal, or medical
          advice. If you believe a post defames a named person, discloses private data, or
          infringes copyright (under the Ghana Copyright Act, 2005, Act 690 — subject to legal
          verification), report it in-app or contact our takedown desk via the Data &amp; Takedown
          page. Plausible complaints are hidden pending human review within 24 hours.
        </p>
      </section>
    </LegalDocumentLayout>
  );
}

