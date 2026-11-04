import { NextRequest } from 'next/server';
import { dbRemovePushSubscription } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body.endpoint !== 'string') {
      return apiError('invalid_subscription', 'Endpoint is required to unsubscribe.', 400);
    }

    const userId = getAuthenticatedUserId(req);
    await dbRemovePushSubscription(userId, body.endpoint);
    return apiSuccess({ unsubscribed: true });
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
