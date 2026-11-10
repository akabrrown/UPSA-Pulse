import { NextRequest } from 'next/server';
import { moderationActionSchema } from '@/lib/validation/schemas';
import { dbApplyModerationAction } from '@/lib/db/postgres';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Resilient payload normalization: handle UI actions ('dismiss', 'hide', 'suspend')
    let normalized = body;
    if (typeof body === 'object' && body !== null) {
      let action = body.action;
      if (action === 'dismiss' || action === 'dismiss_flag') {
        action = 'dismiss_report';
      } else if (action === 'hide') {
        action = 'remove';
      }
      let suspendDays = body.suspendDays;
      if (action === 'suspend' && !suspendDays) {
        if (body.suspensionDurationHours === 168 || !body.suspensionDurationHours) {
          suspendDays = 7;
        } else if (body.suspensionDurationHours === 24) {
          suspendDays = 1;
        } else {
          suspendDays = 30;
        }
      }
      normalized = {
        ...body,
        action,
        ...(suspendDays !== undefined ? { suspendDays } : {}),
      };
    }

    const parsed = moderationActionSchema.safeParse(normalized);
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
