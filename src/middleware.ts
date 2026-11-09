import { NextResponse, type NextRequest } from 'next/server';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Force HTTPS in production environments if forwarded via plain HTTP
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto === 'http') {
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl, 301);
  }

  // 2. Lock /admin path to authenticated sessions
  if (pathname.startsWith('/admin')) {
    const sessionCookie = request.cookies.get('pulse_uid')?.value;
    if (!sessionCookie) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/';
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 3. Strict CSRF & Origin Defense on all mutating API calls
  if (pathname.startsWith('/api/') && MUTATING_METHODS.has(request.method)) {
    const host = request.headers.get('host');
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const secFetchSite = request.headers.get('sec-fetch-site');

    if (secFetchSite === 'cross-site') {
      return NextResponse.json(
        {
          error: 'csrf_cross_site_blocked',
          message: 'Cross-site mutating requests are strictly blocked.',
        },
        { status: 403 }
      );
    }

    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json(
            {
              error: 'csrf_origin_mismatch',
              message: 'Cross-origin mutating API requests are not permitted.',
            },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'invalid_origin', message: 'Invalid Origin header.' },
          { status: 403 }
        );
      }
    } else if (referer && host) {
      try {
        const refererHost = new URL(referer).host;
        if (refererHost !== host) {
          return NextResponse.json(
            {
              error: 'csrf_referer_mismatch',
              message: 'Cross-origin mutating referer is not permitted.',
            },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'invalid_referer', message: 'Invalid Referer header.' },
          { status: 403 }
        );
      }
    }
  }

  const response = NextResponse.next();

  // 4. Hardened Security Headers & Content Security Policy (CSP)
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self)'
  );
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; form-action 'self'; base-uri 'self';"
  );

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js).*)'],
};

