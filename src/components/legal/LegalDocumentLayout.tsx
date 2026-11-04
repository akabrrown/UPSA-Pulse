import Link from 'next/link';
import type { ReactNode } from 'react';

interface LegalDocumentLayoutProps {
  title: string;
  version: string;
  effectiveDate: string;
  summary: string;
  children: ReactNode;
}

export function LegalDocumentLayout({
  title,
  version,
  effectiveDate,
  summary,
  children,
}: LegalDocumentLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)]">
      <header className="bg-[#0B2A5B] text-white border-b border-[#1C4A8F]">
        <div className="max-w-[640px] mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-bold text-lg tracking-tight text-white hover:opacity-90 min-h-[44px] px-2 -ml-2 rounded-[8px]"
          >
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 rounded-full bg-[#D9A21B]"
            />
            <span>UPSA Pulse</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-semibold text-[#D9A21B] hover:underline min-h-[44px] inline-flex items-center px-2"
          >
            Back to Feed
          </Link>
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-6 space-y-6">
        <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] leading-[18px] text-[var(--text-secondary)]">
            <span>Version {version}</span>
            <span>Effective: {effectiveDate}</span>
          </div>
          <h1 className="text-[22px] leading-[28px] font-bold text-[var(--text-heading)]">
            {title}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] bg-[var(--surface-subtle)] p-3 rounded-[8px] border border-[var(--border-color)]">
            {summary}
          </p>
        </div>

        <article className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-5 text-[16px] leading-[24px]">
          {children}
        </article>

        <footer className="border-t border-[var(--border-color)] pt-4 pb-8 text-[13px] leading-[18px] text-[var(--text-secondary)] space-y-3">
          <p>
            Independent student utility built by Codey Dev. Not an official channel of the
            University of Professional Studies, Accra (UPSA) unless formally endorsed.
          </p>
          <nav aria-label="Legal navigation" className="flex flex-wrap gap-4 font-semibold">
            <Link href="/terms" className="hover:underline text-[var(--text-heading)]">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:underline text-[var(--text-heading)]">
              Privacy Notice
            </Link>
            <Link
              href="/community-guidelines"
              className="hover:underline text-[var(--text-heading)]"
            >
              Community Guidelines
            </Link>
            <Link href="/accessibility" className="hover:underline text-[var(--text-heading)]">
              Accessibility
            </Link>
            <Link href="/help/your-data" className="hover:underline text-[var(--text-heading)]">
              Your Data & Deletion
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

