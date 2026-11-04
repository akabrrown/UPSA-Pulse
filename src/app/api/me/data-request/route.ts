import { NextRequest } from 'next/server';
import { dataRequestSchema } from '@/lib/validation/schemas';
import { dbCreateDataRequest } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = dataRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        'invalid_input',
        parsed.error.issues[0]?.message ?? 'Provide request type and details.',
        400
      );
    }

    const userId = getAuthenticatedUserId(req);
    const record = await dbCreateDataRequest(userId, parsed.data);
    return apiSuccess(record, 201);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
