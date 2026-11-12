'use client';

import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const suppressExtensionErrors = (event: ErrorEvent) => {
      const file = event.filename || '';
      if (
        file.includes('webextension.js') ||
        file.startsWith('chrome-extension://') ||
        file.startsWith('moz-extension://') ||
        file.startsWith('safari-web-extension://')
      ) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    window.addEventListener('error', suppressExtensionErrors, true);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.warn('PWA service worker registration:', err);
        });
    }

    return () => {
      window.removeEventListener('error', suppressExtensionErrors, true);
    };
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
