import { NextRequest } from 'next/server';
import { reportContentSchema } from '@/lib/validation/schemas';
import { dbReportContent } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = reportContentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('invalid_report', 'Please select a report reason.', 400);
    }

    const userId = getAuthenticatedUserId(req);
    const result = await dbReportContent(userId, parsed.data);
    return apiSuccess(result, 201);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
