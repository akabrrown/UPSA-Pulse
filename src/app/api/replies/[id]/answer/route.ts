import { NextRequest } from 'next/server';
import { dbMarkAnswer, dbGetReplyAuthor } from '@/lib/db/postgres';
import { sendPushNotificationToUser } from '@/lib/push/web-push-service';
import { apiSuccess, getAuthenticatedUserId, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const userId = getAuthenticatedUserId(req);
    await dbMarkAnswer(userId, id);

    try {
      const replyInfo = await dbGetReplyAuthor(id);
      if (replyInfo && replyInfo.authorId && replyInfo.authorId !== userId) {
        void sendPushNotificationToUser(replyInfo.authorId, {
          title: 'Answer Accepted! · UPSA Pulse',
          body: 'Your reply was pinned as the accepted answer on campus.',
          url: `/?thread=${encodeURIComponent(replyInfo.postId)}`,
        });
      }
    } catch (pushErr) {
      console.warn('[WebPush] Error triggering answer accepted push notification:', pushErr);
    }

    return apiSuccess({ answeredReplyId: id });
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
