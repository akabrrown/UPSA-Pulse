import { NextRequest } from 'next/server';
import { moderationActionSchema } from '@/lib/validation/schemas';
import { dbApplyModerationAction } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = moderationActionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        'invalid_input',
        parsed.error.issues[0]?.message ?? 'A valid moderation action and mandatory reason are required.',
        400
      );
    }

    const actorId = getAuthenticatedUserId(req);
    const actionRecord = await dbApplyModerationAction(actorId, parsed.data);
    return apiSuccess(actionRecord, 201);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
