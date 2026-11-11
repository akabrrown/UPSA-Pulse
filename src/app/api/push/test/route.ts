import { NextRequest } from 'next/server';
import { sendPushNotificationToUser } from '@/lib/push/web-push-service';
import {
  apiSuccess,
  getAuthenticatedUserId,
  mapDomainErrorToResponse,
} from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(req);
    const result = await sendPushNotificationToUser(userId, {
      title: 'UPSA Pulse Test Alert',
      body: 'Push notifications are active and working on this device!',
      url: '/?tab=alerts',
    });

    return apiSuccess({
      delivered: result.delivered,
      failed: result.failed,
      message:
        result.delivered > 0
          ? `Test alert delivered to ${result.delivered} active device(s).`
          : 'No active push subscriptions found on your account. Tap "Enable Push" first.',
    });
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}
