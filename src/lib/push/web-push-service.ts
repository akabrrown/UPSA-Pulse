import * as webpush from 'web-push';
import { getServerEnv } from '@/lib/env';
import {
  dbGetPushSubscriptionsForUser,
  dbRemovePushSubscription,
} from '@/lib/db/postgres';

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

function getWebPushClient() {
  const mod = webpush as unknown as {
    default?: typeof webpush;
    setVapidDetails?: typeof webpush.setVapidDetails;
    sendNotification?: typeof webpush.sendNotification;
  };
  if (typeof mod.setVapidDetails === 'function') {
    return mod as unknown as typeof webpush;
  }
  if (mod.default && typeof mod.default.setVapidDetails === 'function') {
    return mod.default;
  }
  return webpush;
}

let vapidConfigured = false;

export function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  try {
    const env = getServerEnv();
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
      const client = getWebPushClient();
      client.setVapidDetails(
        env.VAPID_SUBJECT,
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY
      );
      vapidConfigured = true;
      return true;
    }
  } catch (err) {
    console.warn('[WebPush] Error initializing VAPID credentials:', err);
  }
  return false;
}

export async function sendPushNotificationToSubscription(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: PushNotificationPayload
): Promise<{ success: boolean; expired: boolean; error?: string }> {
  // If endpoint is a test/local simulated endpoint, return mock success
  if (sub.endpoint.includes('push.upsapulse.local') || sub.endpoint.startsWith('mock://')) {
    return { success: true, expired: false };
  }

  const isConfigured = ensureVapidConfigured();
  if (!isConfigured) {
    return {
      success: false,
      expired: false,
      error: 'VAPID credentials not configured on server.',
    };
  }

  const jsonPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    tag: payload.tag,
  });

  try {
    const client = getWebPushClient();
    await client.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      jsonPayload,
      {
        TTL: 86400, // 24 hours
        urgency: 'high',
      }
    );
    return { success: true, expired: false };
  } catch (err: unknown) {
    const error = err as { statusCode?: number; message?: string };
    const statusCode = error.statusCode;

    // 410 Gone or 404 Not Found indicates the push subscription has expired or was revoked
    if (statusCode === 410 || statusCode === 404) {
      return { success: false, expired: true, error: 'Subscription expired or revoked' };
    }

    return {
      success: false,
      expired: false,
      error: error.message ?? 'Unknown Web Push error',
    };
  }
}

export async function sendPushNotificationToUser(
  userId: string,
  payload: PushNotificationPayload
): Promise<{ delivered: number; failed: number }> {
  try {
    const subscriptions = await dbGetPushSubscriptionsForUser(userId);
    if (!subscriptions || subscriptions.length === 0) {
      return { delivered: 0, failed: 0 };
    }

    let delivered = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await sendPushNotificationToSubscription(sub, payload);
        if (result.success) {
          delivered += 1;
        } else {
          failed += 1;
          if (result.expired) {
            // Clean up defunct subscription
            try {
              await dbRemovePushSubscription(userId, sub.endpoint);
            } catch {
              // Non-fatal cleanup error
            }
          }
        }
      })
    );

    return { delivered, failed };
  } catch (err) {
    console.error('[WebPush] Error dispatching push notifications to user:', err);
    return { delivered: 0, failed: 0 };
  }
}
