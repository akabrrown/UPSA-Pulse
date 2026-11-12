import { NextRequest } from 'next/server';
import { sendPushNotificationToUser } from '@/lib/push/web-push-service';
import { dbSavePushSubscription } from '@/lib/db/postgres';
import { pushSubscriptionSchema } from '@/lib/validation/schemas';
import {
  apiSuccess,
  getAuthenticatedUserId,
  mapDomainErrorToResponse,
} from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(req);

    // Optional inline subscription sync if client sends its active PushSubscription
    try {
      const body = await req.json();
      const rawSub = body?.subscription ?? body;
      const parsed = pushSubscriptionSchema.safeParse(rawSub);
      if (parsed.success) {
        await dbSavePushSubscription(userId, parsed.data);
      }
    } catch {
      // Request had no JSON body; proceed with existing stored subscriptions
    }

    const result = await sendPushNotificationToUser(userId, {
      title: 'UPSA Pulse Test Alert',
      body: 'Push notifications are active and working on this device!',
      url: '/?tab=alerts',
      tag: `test-alert-${Date.now()}`,
    });

    const needsResubscribe =
      result.delivered === 0 && ((result.expiredCount ?? 0) > 0 || result.failed === 0);

    return apiSuccess({
      delivered: result.delivered,
      failed: result.failed,
      expiredCount: result.expiredCount ?? 0,
      needsResubscribe,
      message:
        result.delivered > 0
          ? `Test alert delivered to ${result.delivered} active device(s).`
          : (result.expiredCount ?? 0) > 0
          ? 'Your browser push token had expired and was reset. Tap "Send Test Alert" again to verify.'
          : result.failed > 0
          ? `Push delivery failed (${result.lastError ?? 'check browser notification settings'}).`
          : 'No active push subscriptions found on your account. Tap "Enable Push" first.',
    });
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
