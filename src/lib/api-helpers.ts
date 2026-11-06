import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_DEMO_USER_ID } from '@/lib/store/pulse-store';
import { signSessionToken, verifySessionToken } from '@/lib/domain/pulse-engine';

const DEFAULT_FALLBACK_PEPPER = 'upsa-pulse-device-pepper-default-32-chars-long';

function getSessionPepper(): string {
  return process.env.DEVICE_HASH_PEPPER?.trim() || DEFAULT_FALLBACK_PEPPER;
}

export function getAuthenticatedUserId(req: NextRequest): string {
  const pepper = getSessionPepper();
  const headerUser = req.headers.get('x-pulse-user-id');
  if (headerUser) {
    const verified = verifySessionToken(headerUser, pepper);
    if (verified) return verified;
  }
  const cookieVal = req.cookies.get('pulse_uid')?.value;
  if (cookieVal) {
    const verified = verifySessionToken(cookieVal, pepper);
    if (verified) return verified;
  }
  return DEFAULT_DEMO_USER_ID;
}

/**
 * Attaches a cryptographically signed, HTTP-only, secure session cookie to a response.
 * Protects against XSS session theft, client tampering, and CSRF.
 */
export function attachSessionCookie(
  response: NextResponse,
  userId: string,
  pepper?: string
): NextResponse {
  const secret = pepper?.trim() || getSessionPepper();
  const signedToken = signSessionToken(userId, secret);
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set('pulse_uid', signedToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
  return response;
}

/**
 * Explicitly clears the session cookie (used upon logout or account deletion).
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
  const isProduction = process.env.NODE_ENV === 'production';
  response.cookies.set('pulse_uid', '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      error: null,
    },
    { status }
  );
}

export function apiError(code: string, message: string, status = 400) {
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: {
        code,
        message,
      },
    },
    { status }
  );
}

export function mapDomainErrorToResponse(err: unknown) {
  const code = err instanceof Error ? err.message : 'internal_error';

  switch (code) {
    case 'zone_not_verified':
      return apiError(
        'zone_not_verified',
        'Pulse only works on and around the UPSA campus. Move closer and try again.',
        403
      );
    case 'rate_limited':
      return apiError(
        'rate_limited',
        'You have reached the hourly posting limit. Please wait a few minutes and try again.',
        429
      );
    case 'own_content':
      return apiError('own_content', 'You cannot vote on your own content.', 400);
    case 'conflict_of_interest':
      return apiError(
        'conflict_of_interest',
        'Moderators cannot moderate threads they have participated in.',
        403
      );
    case 'unmask_disabled_by_policy':
      return apiError(
        'unmask_disabled_by_policy',
        'Author unmasking is disabled until formal written policy approval [DECISION D6].',
        403
      );
    case 'two_person_rule_violation':
      return apiError(
        'two_person_rule_violation',
        'A second distinct unmask holder must review and approve this request.',
        403
      );
    case 'same_moderator_cannot_review_appeal':
      return apiError(
        'same_moderator_cannot_review_appeal',
        'An appeal must be reviewed by a different moderator than the one who issued the original action.',
        403
      );
    case 'appeal_already_submitted':
      return apiError(
        'appeal_already_submitted',
        'An appeal has already been submitted for this moderation action.',
        409
      );
    case 'student_already_registered':
      return apiError(
        'student_already_registered',
        'A student account with this UPSA index number or username already exists.',
        409
      );
    case 'invalid_credentials':
      return apiError(
        'invalid_credentials',
        'Invalid UPSA index number, username, or password.',
        401
      );
    case 'account_not_found':
      return apiError(
        'account_not_found',
        'No student account matched that UPSA index number or username.',
        404
      );
    case 'invalid_reset_code':
      return apiError(
        'invalid_reset_code',
        'Invalid or expired 6-digit password reset code.',
        400
      );
    case 'index_required_for_google_signup':
      return apiError(
        'index_required_for_google_signup',
        'Please enter your UPSA student index number and accept the legal consents to complete Google sign-up.',
        400
      );
    case 'forbidden':
    case 'account_suspended':
    case 'account_banned':
      return apiError(code, 'You do not have permission to perform this action.', 403);
    case 'post_unavailable':
    case 'target_unavailable':
      return apiError(code, 'This item is no longer available.', 404);
    default:
      return apiError(code, 'Request could not be completed.', 400);
  }
}

