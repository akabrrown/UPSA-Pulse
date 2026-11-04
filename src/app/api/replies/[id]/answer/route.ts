import { NextRequest } from 'next/server';
import { dbMarkAnswer } from '@/lib/db/postgres';
import { apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const userId = getAuthenticatedUserId(req);
    await dbMarkAnswer(userId, id);
    return apiSuccess({ answeredReplyId: id });
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
