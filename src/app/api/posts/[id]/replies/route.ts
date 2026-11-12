import { NextRequest } from 'next/server';
import { createReplySchema } from '@/lib/validation/schemas';
import { dbCreateReply, dbGetPostAuthor } from '@/lib/db/postgres';
import { sendPushNotificationToUser } from '@/lib/push/web-push-service';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const parsed = createReplySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        'invalid_input',
        parsed.error.issues[0]?.message ?? 'Reply must be between 1 and 300 characters.',
        400
      );
    }

    const userId = getAuthenticatedUserId(req);
    const reply = await dbCreateReply(userId, id, parsed.data.body);

    if (reply.status === 'published') {
      try {
        const postAuthorId = await dbGetPostAuthor(id);
        if (postAuthorId && postAuthorId !== userId) {
          await sendPushNotificationToUser(postAuthorId, {
            title: 'UPSA Pulse',
            body: `New reply from Student ${reply.aliasNo}: "${parsed.data.body.slice(0, 80)}"`,
            url: `/?thread=${encodeURIComponent(id)}`,
            tag: `reply-${reply.id}`,
          });
        }
      } catch (pushErr) {
        console.warn('[WebPush] Error triggering reply push notification:', pushErr);
      }
    }

    return apiSuccess(
      {
        reply,
        heldMessage:
          reply.status === 'held'
            ? 'Your reply is being checked. It will appear soon if it follows the guidelines.'
            : null,
        showSupportCard: reply.showSupportCard,
      },
      201
    );
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
