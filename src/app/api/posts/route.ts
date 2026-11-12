import { NextRequest } from 'next/server';
import { createPostSchema } from '@/lib/validation/schemas';
import { dbCreatePost } from '@/lib/db/postgres';
import { sendPushNotificationToCampusSubscribers } from '@/lib/push/web-push-service';
import { apiError, apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createPostSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        'invalid_input',
        parsed.error.issues[0]?.message ?? 'Invalid post content.',
        400
      );
    }

    const userId = getAuthenticatedUserId(req);
    const created = await dbCreatePost(userId, parsed.data);

    if (created.status === 'published') {
      try {
        await sendPushNotificationToCampusSubscribers(userId, {
          title:
            created.kind === 'ask'
              ? `New Campus Ask · ${created.zoneName}`
              : `New Campus Post · ${created.zoneName}`,
          body: created.body.slice(0, 90),
          url: `/?thread=${encodeURIComponent(created.id)}`,
          tag: `post-${created.id}`,
        });
      } catch (pushErr) {
        console.warn('[WebPush] Error triggering new post push notification:', pushErr);
      }
    }

    return apiSuccess(
      {
        post: created,
        heldMessage:
          created.status === 'held'
            ? 'Your post is being checked. It will appear soon if it follows the guidelines.'
            : null,
        showSupportCard: created.showSupportCard,
      },
      201
    );
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
