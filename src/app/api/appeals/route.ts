import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';
import { dbDecideAppeal, dbSubmitAppeal } from '@/lib/db/postgres';
import { decideAppealSchema, submitAppealSchema } from '@/lib/validation/schemas';

export async function POST(request: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(request);
    const body = await request.json();
    const parsed = submitAppealSchema.safeParse(body);

    if (!parsed.success) {
      return apiError('validation_error', 'Enter a valid appeal message (5-500 characters).', 400);
    }

    const appeal = await dbSubmitAppeal(userId, parsed.data);
    return apiSuccess(appeal, 201);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actorUserId = getAuthenticatedUserId(request);
    const body = await request.json();
    const parsed = decideAppealSchema.safeParse(body);

    if (!parsed.success) {
      return apiError('validation_error', 'Enter a valid decision and note.', 400);
    }

    const decided = await dbDecideAppeal(actorUserId, parsed.data);
    return apiSuccess(decided, 200);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
