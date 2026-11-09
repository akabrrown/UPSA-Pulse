import { NextRequest } from 'next/server';
import { dbGetSecurityAuditLogs } from '@/lib/db/postgres';
import { apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const actorId = getAuthenticatedUserId(req);
    const searchParams = req.nextUrl.searchParams;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const event = searchParams.get('event') ?? undefined;
    const rawType = searchParams.get('type');
    const type =
      rawType === 'system' || rawType === 'deleted_messages' || rawType === 'deleted_users'
        ? rawType
        : 'all';

    const auditData = await dbGetSecurityAuditLogs(actorId, {
      limit: isNaN(limit) ? 50 : limit,
      event,
      type,
    });

    const response = apiSuccess(auditData);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

