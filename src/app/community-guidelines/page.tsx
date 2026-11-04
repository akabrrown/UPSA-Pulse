import { LegalDocumentLayout } from '@/components/legal/LegalDocumentLayout';

export const metadata = {
  title: 'Community Guidelines · UPSA Pulse',
};

export default function CommunityGuidelinesPage() {
  return (
    <LegalDocumentLayout
      title="Community Guidelines"
      version="1.0"
      effectiveDate="17 October 2026"
      summary="UPSA Pulse works because students can ask honest questions without fear. Pseudonymity is a shield for honest speech, never a weapon to harm others."
    >
      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          1. Be useful, local, and fair
        </h2>
        <p>
          Share accurate tips on registration, hostels, food, timetables, and lost items. When
          discussing courses or campus life, focus on facts and experiences rather than personal
          attacks.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          2. Zero tolerance for doxxing and personal exposure (Priority P1 — 2h review)
        </h2>
        <p>
          Never post phone numbers, student index numbers, hostel room numbers, private addresses,
          or identifying details of another student or staff member. Posts matching phone number or
          doxxing patterns are held automatically and hidden after 2 priority reports.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          3. Threats, harassment, and defamation
        </h2>
        <p>
          Threats of violence (Priority P1), targeted bullying, slurs, body-shaming, sexual
          solicitation, and unverified defamatory claims naming lecturers or students are strictly
          prohibited and lead to removal, suspension, or permanent ban.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          4. Exam integrity
        </h2>
        <p>
          Leaking exam papers, buying or selling exam questions, or coordinating academic
          malpractice is blocked by keyword pre-screening and heightened exam-week moderation.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          5. Self-harm and distress support
        </h2>
        <p>
          If a post indicates self-harm or severe emotional distress, it is held from public view
          and we display direct contact details for the UPSA Guidance and Counselling Unit so the
          author can reach confidential support immediately.
        </p>
      </section>
    </LegalDocumentLayout>
  );
}

