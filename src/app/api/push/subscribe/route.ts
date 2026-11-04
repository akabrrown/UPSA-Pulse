import { NextRequest } from 'next/server';
import { pushSubscriptionSchema } from '@/lib/validation/schemas';
import { dbSavePushSubscription } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = pushSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('invalid_subscription', 'Valid Web Push endpoint and keys are required.', 400);
    }

    const userId = getAuthenticatedUserId(req);
    const sub = await dbSavePushSubscription(userId, parsed.data);
    return apiSuccess({ subscribed: true, id: sub.id }, 201);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
