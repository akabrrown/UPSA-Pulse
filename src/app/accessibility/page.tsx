import { LegalDocumentLayout } from '@/components/legal/LegalDocumentLayout';

export const metadata = {
  title: 'Accessibility Statement · UPSA Pulse',
};

export default function AccessibilityPage() {
  return (
    <LegalDocumentLayout
      title="Accessibility Statement"
      version="1.0"
      effectiveDate="17 October 2026"
      summary="UPSA Pulse is engineered to meet WCAG 2.1 Level AA across mobile and desktop browsers, including low-cost Android devices outdoors."
    >
      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          1. Contrast and outdoor readability
        </h2>
        <p>
          All primary text meets or exceeds WCAG AAA contrast (14.0:1 for UPSA Navy{' '}
          <code>#0B2A5B</code> on white; 14.7:1 for Ink <code>#1B2433</code> on app background).
          Gold <code>#D9A21B</code> is never used as text on white; gold text on light backgrounds
          uses high-contrast <code>#8A6200</code> (5.5:1) or navy text on a gold fill (6.1:1).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          2. Touch targets, keyboard navigation, and screen readers
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Every interactive button, tab, and vote control has a minimum 44 × 44 px target.</li>
          <li>
            Keyboard navigation uses a high-visibility 2 px gold focus ring with a 2 px navy
            offset.
          </li>
          <li>
            Vote buttons announce their action, current score, and selected state to screen
            readers. Thread-local geometric glyphs are marked <code>aria-hidden=&quot;true&quot;</code>{' '}
            while alias chips are read aloud as plain text (<strong>OP</strong>,{' '}
            <strong>Student 1</strong>).
          </li>
          <li>
            Channels use distinct vector icons and text labels—colour is never the sole carrier of
            meaning.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
          3. Reduced motion and zoom
        </h2>
        <p>
          Layouts support 200% text zoom at 360 px viewport width without horizontal scrolling.
          When <code>prefers-reduced-motion: reduce</code> is enabled on your device, all CSS
          transforms and animations are disabled automatically.
        </p>
      </section>
    </LegalDocumentLayout>
  );
}

