import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';
import { dbApprovePendingDevice } from '@/lib/db/postgres';
import { approveDeviceSchema } from '@/lib/validation/schemas';

export async function POST(request: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(request);
    const body = await request.json();
    const parsed = approveDeviceSchema.safeParse(body);

    if (!parsed.success) {
      return apiError('validation_error', 'Enter a valid device token.', 400);
    }

    const pepper = process.env.DEVICE_PEPPER || 'upsa-pulse-default-dev-pepper-2026';
    const result = await dbApprovePendingDevice({
      userId,
      rawDeviceToken: parsed.data.rawDeviceToken,
      pepper,
    });

    return apiSuccess(result, 200);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
