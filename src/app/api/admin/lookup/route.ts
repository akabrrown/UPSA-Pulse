import { NextRequest } from 'next/server';
import { dbLookupCaseByPostOrAlias } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get('postId');
    const aliasNo = Number(searchParams.get('aliasNo') ?? '0');

    if (!postId) {
      return apiError('invalid_input', 'postId is required for case lookup.', 400);
    }

    const actorId = getAuthenticatedUserId(req);
    const result = await dbLookupCaseByPostOrAlias(actorId, postId, aliasNo);
    return apiSuccess(result);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

