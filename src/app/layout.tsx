import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import { Providers } from '@/components/pulse/Providers';
import './globals.css';

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
  weight: ['400', '600', '700'],
});

export const metadata: Metadata = {
  title: 'UPSA Pulse · Campus Feed',
  description:
    'Location-gated, pseudonymous campus feed for verified UPSA students. Ask questions, share campus updates, and get answers fast.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B2A5B',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

