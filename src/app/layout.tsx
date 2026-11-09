import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/pulse/Providers';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://upsapulse.org'),
  title: 'UPSA Pulse · Campus Feed',
  description:
    'Location-gated, pseudonymous campus feed for verified UPSA students across Main Campus, Hostel A, Hostel B, and Hostel C.',
  applicationName: 'UPSA Pulse',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'UPSA Pulse',
    statusBarStyle: 'black-translucent',
    startupImage: [
      {
        url: '/splash/apple-splash-1170x2532.png',
        media:
          '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)',
      },
      {
        url: '/splash/apple-splash-1290x2796.png',
        media:
          '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)',
      },
      {
        url: '/splash/apple-splash-750x1334.png',
        media:
          '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)',
      },
    ],
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'UPSA Pulse · Campus & Hostel Feed',
    description:
      'Location-gated, pseudonymous campus feed for verified UPSA students. Ask questions, share campus updates, and get answers fast.',
    images: [{ url: '/og-banner.png', width: 1200, height: 630, alt: 'UPSA Pulse Campus Feed' }],
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0B2A5B',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
