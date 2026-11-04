import { NextRequest } from 'next/server';
import { unmaskRequestSchema } from '@/lib/validation/schemas';
import { executeUnmaskActionInStore } from '@/lib/store/pulse-store';
import { getServerEnv } from '@/lib/env';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = unmaskRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        'invalid_input',
        parsed.error.issues[0]?.message ?? 'Invalid unmask request payload.',
        400
      );
    }

    const actorId = getAuthenticatedUserId(req);
    const env = getServerEnv();
    const result = executeUnmaskActionInStore(actorId, parsed.data, {
      policyEnabled: env.ENABLE_UNMASK_WORKFLOW,
    });
    return apiSuccess(result);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

