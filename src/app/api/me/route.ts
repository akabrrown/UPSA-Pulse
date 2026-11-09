import { NextRequest } from 'next/server';
import { deleteAccountSchema } from '@/lib/validation/schemas';
import {
  dbDeleteAccount,
  dbGetMeAndNotifications,
  dbMarkNotificationsRead,
} from '@/lib/db/postgres';
import { apiError, apiSuccess, clearSessionCookie, getAuthenticatedUserId, getOptionalAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const userId = getOptionalAuthenticatedUserId(req);
    if (!userId) {
      return apiSuccess({ profile: null, notifications: [] });
    }
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
    let filter: { notificationId?: number; postId?: string } | undefined;
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        const notifId = typeof body.notificationId === 'number' ? body.notificationId : undefined;
        const pId = typeof body.postId === 'string' ? body.postId : undefined;
        if (notifId !== undefined || pId !== undefined) {
          filter = { notificationId: notifId, postId: pId };
        }
      }
    } catch {
      // Empty body falls back to marking all as read
    }
    await dbMarkNotificationsRead(userId, filter);
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
