import { NextRequest } from 'next/server';
import { dbGetModerationQueue } from '@/lib/db/postgres';
import { apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const actorId = getAuthenticatedUserId(req);
    const items = await dbGetModerationQueue(actorId);
    return apiSuccess({ items });
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
