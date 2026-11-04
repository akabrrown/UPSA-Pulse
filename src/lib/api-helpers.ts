import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_DEMO_USER_ID } from '@/lib/store/pulse-store';

export function getAuthenticatedUserId(req: NextRequest): string {
  const headerUser = req.headers.get('x-pulse-user-id');
  const cookieUser = req.cookies.get('pulse_uid')?.value;
  return headerUser || cookieUser || DEFAULT_DEMO_USER_ID;
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

