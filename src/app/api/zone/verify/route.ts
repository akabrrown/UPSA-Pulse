import { NextRequest } from 'next/server';
import { zoneVerifySchema } from '@/lib/validation/schemas';
import { dbVerifyUserZone } from '@/lib/db/postgres';
import { apiError, apiSuccess, getOptionalAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const userId = getOptionalAuthenticatedUserId(req);
    if (!userId) {
      return apiError('auth_required', 'Sign in to verify your campus location.', 401);
    }

    const body = await req.json();
    const parsed = zoneVerifySchema.safeParse(body);
    if (!parsed.success) {
      return apiError('invalid_input', 'Valid latitude, longitude, and accuracy are required.', 400);
    }

    const result = await dbVerifyUserZone(userId, parsed.data);

    if (!result.verified) {
      return apiError(
        result.reason,
        result.reason === 'accuracy_too_low'
          ? 'Location signal is too weak (>150 m). Move outdoors and try again.'
          : 'Pulse only works on and around the UPSA campus. Move closer and try again.',
        403
      );
    }

    // Coordinates are discarded and never returned or logged
    return apiSuccess({
      verified: true,
      zoneId: result.zoneId,
      zoneName: result.zoneName,
      verifiedUntil: result.verifiedUntil,
    });
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
