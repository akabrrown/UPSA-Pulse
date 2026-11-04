import { NextRequest } from 'next/server';
import { adminConfigUpdateSchema } from '@/lib/validation/schemas';
import { dbGetAdminConfig, dbUpdateAdminConfig } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const actorId = getAuthenticatedUserId(req);
    const config = await dbGetAdminConfig(actorId);
    return apiSuccess(config);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = adminConfigUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('invalid_input', 'Invalid configuration update payload.', 400);
    }

    const actorId = getAuthenticatedUserId(req);
    const updated = await dbUpdateAdminConfig(actorId, parsed.data);
    return apiSuccess(updated);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
