import { NextRequest } from 'next/server';
import { deleteAccountSchema } from '@/lib/validation/schemas';
import {
  dbDeleteAccount,
  dbGetMeAndNotifications,
  dbMarkNotificationsRead,
} from '@/lib/db/postgres';
import { apiError, apiSuccess, clearSessionCookie, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(req);
    const data = await dbGetMeAndNotifications(userId);
    return apiSuccess(data);
  } catch (err) {
    if (err instanceof Error && err.message === 'forbidden') {
      const res = apiSuccess({ profile: null, notifications: [] });
      return clearSessionCookie(res);
    }
    return mapDomainErrorToResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(req);
    await dbMarkNotificationsRead(userId);
    return apiSuccess({ markedRead: true });
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        'invalid_confirmation',
        parsed.error.issues[0]?.message ?? 'Type DELETE and enter your 6-digit OTP to confirm.',
        400
      );
    }

    const userId = getAuthenticatedUserId(req);
    const result = await dbDeleteAccount(userId, parsed.data);
    const res = apiSuccess(result);
    return clearSessionCookie(res);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
