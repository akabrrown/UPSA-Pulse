import { LegalDocumentLayout } from '@/components/legal/LegalDocumentLayout';

export const metadata = {
  title: 'Privacy Notice · UPSA Pulse',
};

export default function PrivacyPage() {
  return (
    <LegalDocumentLayout
      title="Privacy Notice"
      version="1.0"
      effectiveDate="17 October 2026"
      summary="Plain-language summary: other students never see your name, email, or location. We never store GPS coordinates. We keep your verified email and device hash solely to run your account and prevent abuse."
    >
      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          1. Controller and Ghana Data Protection Act (Act 843) notice
        </h2>
        <p>
          UPSA Pulse processes personal data of verified students in accordance with the
          Ghana Data Protection Act, 2012 (Act 843). Data controller responsibility is held by
          the UPSA Pulse operations team in partnership with student campus governance.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          2. What we collect and what we never store
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Stored per user:</strong> Verified UPSA email address, account status, private
            karma score, current zone ID and 15-minute verification expiry timestamp, HMAC-hashed
            device token, versioned legal consent timestamps, and optional Web Push subscription
            keys.
          </li>
          <li>
            <strong>Never stored:</strong> GPS latitude/longitude coordinates (discarded
            immediately after the server tests whether your point is inside the campus polygon),
            address books/contacts, advertising identifiers, or behavioural tracking profiles.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          3. Who sees what (Anonymity &amp; Disclosure Table)
        </h2>
        <p>
          Other students see only your post text and thread-local alias (<strong>OP</strong>,{' '}
          <strong>Student 1</strong>, etc.). Moderators also see only thread aliases and never
          browse a list of student identities. Author identity can be accessed only via our
          two-person audited unmask workflow in response to a valid legal process, an imminent
          threat to life or physical safety, or a formal UPSA disciplinary referral.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          4. Retention schedule
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Published posts and replies:</strong> Active in the feed for 30 days, then
            archived; permanently deleted 12 months after archive or removal.
          </li>
          <li>
            <strong>In-app notifications:</strong> Deleted after 60 days.
          </li>
          <li>
            <strong>Closed moderation reports:</strong> Deleted after 24 months.
          </li>
          <li>
            <strong>Deleted accounts:</strong> Profile, trusted device hashes, votes, alerts, and
            sign-in credentials are deleted immediately. Past posts remain with{' '}
            <code>author_id</code> set to <code>null</code> so threads stay coherent. Consent
            records and deletion log entries are retained for 24 months as compliance evidence and
            then purged automatically.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          5. Cookies and third-party processors
        </h2>
        <p>
          We use strictly necessary HTTP-only session and device-trust cookies only. We do not load
          advertising pixels or third-party analytics cookies. Infrastructure processors (Supabase,
          Vercel, Upstash, Resend, Arcjet, Sentry) process data under standard data processing
          agreements with international transfer safeguards.
        </p>
      </section>
    </LegalDocumentLayout>
  );
}

