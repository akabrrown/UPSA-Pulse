import { NextRequest } from 'next/server';
import { recordConsentSchema } from '@/lib/validation/schemas';
import { dbRecordConsent } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = recordConsentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('invalid_input', 'Valid document name and version are required.', 400);
    }

    const userId = getAuthenticatedUserId(req);
    const consent = await dbRecordConsent(userId, parsed.data);
    return apiSuccess(consent, 201);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
