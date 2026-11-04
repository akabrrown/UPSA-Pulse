import { NextRequest } from 'next/server';
import { dbDeleteOwnPost, dbGetThread } from '@/lib/db/postgres';
import { apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const userId = getAuthenticatedUserId(req);
    const thread = await dbGetThread(userId, id);
    return apiSuccess(thread);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const userId = getAuthenticatedUserId(req);
    await dbDeleteOwnPost(userId, id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
