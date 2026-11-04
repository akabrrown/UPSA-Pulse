import { NextRequest } from 'next/server';
import { castVoteSchema } from '@/lib/validation/schemas';
import { dbCastVote } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = castVoteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('invalid_vote', 'Invalid vote payload.', 400);
    }

    const userId = getAuthenticatedUserId(req);
    const result = await dbCastVote(userId, parsed.data);
    return apiSuccess(result);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = castVoteSchema.safeParse({ ...body, value: 0 });
    if (!parsed.success) {
      return apiError('invalid_vote', 'Invalid vote removal payload.', 400);
    }

    const userId = getAuthenticatedUserId(req);
    const result = await dbCastVote(userId, { ...parsed.data, value: 0 });
    return apiSuccess(result);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
