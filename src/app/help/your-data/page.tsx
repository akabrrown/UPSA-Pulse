import Link from 'next/link';
import { LegalDocumentLayout } from '@/components/legal/LegalDocumentLayout';

export const metadata = {
  title: 'Your Data & Deletion Help · UPSA Pulse',
};

export default function YourDataHelpPage() {
  return (
    <LegalDocumentLayout
      title="Your Data, Access Requests & Account Deletion"
      version="1.0"
      effectiveDate="17 October 2026"
      summary="How to export or correct your personal data, and what happens when you delete your UPSA Pulse account."
    >
      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          1. Self-service account deletion
        </h2>
        <p>
          You can delete your account at any time from the <strong>Me</strong> tab inside the app:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Removed immediately:</strong> Your profile row, email sign-in record, trusted
            device hashes, vote history, in-app alerts, and Web Push subscriptions.
          </li>
          <li>
            <strong>What remains:</strong> Your past published posts and replies stay in their
            threads with <code>author_id</code> set to <code>null</code> so existing student
            discussions remain coherent, with no link back to you. Consent records are kept for 24
            months as legal compliance evidence and then purged.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          2. Data access and correction requests
        </h2>
        <p>
          Signed-in users can file an <strong>Access</strong> (export of your profile, consents,
          hashed devices, notifications, and own posts) or <strong>Correction</strong> request
          directly in the <strong>Me &gt; Privacy &amp; Data Request</strong> panel. Every request
          receives a tracking ID and a 30-day completion target.
        </p>
        <div className="pt-2">
          <Link
            href="/?tab=me"
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] hover:bg-[#1C4A8F]"
          >
            Open Me &gt; Data Request Form
          </Link>
        </div>
      </section>
    </LegalDocumentLayout>
  );
}

