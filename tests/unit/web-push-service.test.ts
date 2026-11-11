import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureVapidConfigured,
  sendPushNotificationToSubscription,
  sendPushNotificationToUser,
} from '@/lib/push/web-push-service';
import {
  savePushSubscriptionInStore,
  getPushSubscriptionsFromStore,
  resetPulseStoreForTests,
  DEFAULT_DEMO_USER_ID,
} from '@/lib/store/pulse-store';
import { POST as postPushTest } from '@/app/api/push/test/route';
import { NextRequest } from 'next/server';

describe('Web Push Notification Service', () => {
  const testUserId = DEFAULT_DEMO_USER_ID;

  beforeEach(() => {
    resetPulseStoreForTests();
  });

  it('configures VAPID details properly from environment', () => {
    const isConfigured = ensureVapidConfigured();
    expect(isConfigured).toBe(true);
  });

  it('handles simulated/local endpoints gracefully', async () => {
    const localSub = {
      endpoint: 'https://push.upsapulse.local/sub/test1',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    };

    const result = await sendPushNotificationToSubscription(localSub, {
      title: 'Campus Notice',
      body: 'Library closing in 30 minutes.',
      url: '/?tab=alerts',
    });

    expect(result.success).toBe(true);
    expect(result.expired).toBe(false);
  });

  it('dispatches push notifications to all subscriptions for a user', async () => {
    savePushSubscriptionInStore(testUserId, {
      endpoint: 'https://push.upsapulse.local/sub/device1',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    });
    savePushSubscriptionInStore(testUserId, {
      endpoint: 'https://push.upsapulse.local/sub/device2',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    });

    const subs = getPushSubscriptionsFromStore(testUserId);
    expect(subs.length).toBe(2);

    const delivery = await sendPushNotificationToUser(testUserId, {
      title: 'New Reply',
      body: 'Student 2 replied to your question.',
      url: '/?thread=123',
    });

    expect(delivery.delivered).toBe(2);
    expect(delivery.failed).toBe(0);
  });

  it('returns 0 delivered when user has no active subscriptions', async () => {
    const delivery = await sendPushNotificationToUser('00000000-0000-0000-0000-000000000099', {
      title: 'Test',
      body: 'No devices',
    });

    expect(delivery.delivered).toBe(0);
    expect(delivery.failed).toBe(0);
  });

  it('POST /api/push/test route dispatches test notification for authenticated users', async () => {
    savePushSubscriptionInStore(testUserId, {
      endpoint: 'https://push.upsapulse.local/sub/test-device',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    });

    const req = new NextRequest('http://localhost:3000/api/push/test', {
      method: 'POST',
      headers: {
        'x-user-id': testUserId,
      },
    });

    const res = await postPushTest(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.delivered).toBe(1);
    expect(json.data.message).toContain('Test alert delivered');
  });
});
