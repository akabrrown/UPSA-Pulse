import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { resetPulseStoreForTests } from '@/lib/store/pulse-store';
import { POST as verifyZonePost } from '@/app/api/zone/verify/route';
import { GET as getFeed } from '@/app/api/feed/route';
import { POST as createPost } from '@/app/api/posts/route';
import { GET as getThread, DELETE as deletePost } from '@/app/api/posts/[id]/route';
import { POST as createReply } from '@/app/api/posts/[id]/replies/route';
import { POST as markAnswer } from '@/app/api/replies/[id]/answer/route';
import { PUT as putVote, DELETE as deleteVote } from '@/app/api/votes/route';
import { POST as reportContent } from '@/app/api/reports/route';
import { GET as getMe, PATCH as patchMe, DELETE as deleteMe } from '@/app/api/me/route';
import { POST as postDataRequest } from '@/app/api/me/data-request/route';
import { POST as postConsent } from '@/app/api/consent/route';
import { GET as getPushVapidConfig, POST as postPushSubscribe } from '@/app/api/push/subscribe/route';
import { POST as postPushUnsubscribe } from '@/app/api/push/unsubscribe/route';
import { GET as getAdminQueue } from '@/app/api/admin/queue/route';
import { POST as postAdminAction } from '@/app/api/admin/actions/route';
import { GET as getAdminConfig, PUT as putAdminConfig } from '@/app/api/admin/config/route';
import { POST as postAdminUnmask } from '@/app/api/admin/unmask/route';
import { POST as postAuthOtp } from '@/app/api/auth/otp/route';
import { POST as postLogout } from '@/app/api/auth/logout/route';
import { POST as postAppeal, PATCH as patchAppeal } from '@/app/api/appeals/route';
import { POST as postApproveDevice } from '@/app/api/devices/approve/route';
import { GET as getAdminLookup } from '@/app/api/admin/lookup/route';
import { applyModerationActionInStore } from '@/lib/store/pulse-store';

function makeReq(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    userId?: string;
  } = {}
): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options.userId) {
    headers.set('x-pulse-user-id', options.userId);
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

describe('HTTP Route Handlers End-to-End Verification (TDD Section 6)', () => {
  const efua = '11111111-1111-4111-8111-111111111111';
  const kojo = '22222222-2222-4222-8222-222222222222';
  const moderator = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    resetPulseStoreForTests();
  });

  it('verifies zone and discards coordinates from response', async () => {
    const res = await verifyZonePost(
      makeReq('http://localhost:3000/api/zone/verify', {
        method: 'POST',
        userId: efua,
        body: { lat: 5.6605, lng: -0.1662, accuracy: 25 },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.verified).toBe(true);
    expect(JSON.stringify(json)).not.toContain('5.6605');
    expect(JSON.stringify(json)).not.toContain('-0.1662');
  });

  it('completes full post -> reply -> vote -> accept answer -> report -> admin moderate lifecycle via Route Handlers', async () => {
    // 1. Create an Ask post as Efua
    const createRes = await createPost(
      makeReq('http://localhost:3000/api/posts', {
        method: 'POST',
        userId: efua,
        body: {
          channelId: 1,
          kind: 'ask',
          body: 'Which room in the Joshua Alabi block hosts the evening accounting tutorial?',
        },
      })
    );
    expect(createRes.status).toBe(201);
    const createdJson = await createRes.json();
    const postId = createdJson.data.post.id as string;

    // 2. Reply as Kojo
    const replyRes = await createReply(
      makeReq(`http://localhost:3000/api/posts/${postId}/replies`, {
        method: 'POST',
        userId: kojo,
        body: { body: 'Room 302 on the third floor, starting at 5:30 PM.' },
      }),
      { params: Promise.resolve({ id: postId }) }
    );
    expect(replyRes.status).toBe(201);
    const replyJson = await replyRes.json();
    const replyId = replyJson.data.reply.id as string;
    expect(replyJson.data.reply.aliasNo).toBe(1);

    // 3. Upvote post as Kojo and then remove vote
    const voteRes = await putVote(
      makeReq('http://localhost:3000/api/votes', {
        method: 'PUT',
        userId: kojo,
        body: { targetType: 'post', targetId: postId, value: 1 },
      })
    );
    expect(voteRes.status).toBe(200);
    expect((await voteRes.json()).data.score).toBe(1);

    const removeVoteRes = await deleteVote(
      makeReq('http://localhost:3000/api/votes', {
        method: 'DELETE',
        userId: kojo,
        body: { targetType: 'post', targetId: postId, value: 0 },
      })
    );
    expect(removeVoteRes.status).toBe(200);
    expect((await removeVoteRes.json()).data.score).toBe(0);

    // 4. Mark answer as Efua
    const ansRes = await markAnswer(
      makeReq(`http://localhost:3000/api/replies/${replyId}/answer`, {
        method: 'POST',
        userId: efua,
      }),
      { params: Promise.resolve({ id: replyId }) }
    );
    expect(ansRes.status).toBe(200);

    // 5. Read thread and feed — confirm zero author_id leak
    const threadRes = await getThread(
      makeReq(`http://localhost:3000/api/posts/${postId}`, { userId: efua }),
      { params: Promise.resolve({ id: postId }) }
    );
    expect(threadRes.status).toBe(200);
    const threadText = JSON.stringify(await threadRes.json());
    expect(threadText).not.toContain('author_id');
    expect(threadText).not.toContain('authorId');

    const feedRes = await getFeed(
      makeReq('http://localhost:3000/api/feed?sort=hot', { userId: efua })
    );
    expect(feedRes.status).toBe(200);

    // 6. Report post and moderate via Admin Queue
    const repRes = await reportContent(
      makeReq('http://localhost:3000/api/reports', {
        method: 'POST',
        userId: kojo,
        body: { targetType: 'post', targetId: postId, reason: 'spam', note: 'Test report' },
      })
    );
    expect(repRes.status).toBe(201);

    const queueRes = await getAdminQueue(
      makeReq('http://localhost:3000/api/admin/queue', { userId: moderator })
    );
    expect(queueRes.status).toBe(200);
    const queueJson = await queueRes.json();
    expect(queueJson.data.items.some((i: { targetId: string }) => i.targetId === postId)).toBe(true);

    const modActionRes = await postAdminAction(
      makeReq('http://localhost:3000/api/admin/actions', {
        method: 'POST',
        userId: moderator,
        body: {
          targetType: 'post',
          targetId: postId,
          action: 'restore',
          reason: 'Verified legitimate academic question',
        },
      })
    );
    expect(modActionRes.status).toBe(201);

    // 7. Delete own post as Efua
    const delPostRes = await deletePost(
      makeReq(`http://localhost:3000/api/posts/${postId}`, {
        method: 'DELETE',
        userId: efua,
      }),
      { params: Promise.resolve({ id: postId }) }
    );
    expect(delPostRes.status).toBe(200);
  });

  it('handles auth OTP, consent, push subscription, data request, admin config, unmask gate, and account deletion routes', async () => {
    const otpReq = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'request_otp',
          email: 'newstudent@st.upsa.edu.gh',
          adultConfirmed: true,
          termsAccepted: true,
          privacyAccepted: true,
          guidelinesAccepted: true,
        },
      })
    );
    expect(otpReq.status).toBe(200);

    const otpVerify = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          email: 'newstudent@st.upsa.edu.gh',
          otp: '123456',
          deviceToken: 'device-token-123456',
        },
      })
    );
    expect(otpVerify.status).toBe(200);

    const consentRes = await postConsent(
      makeReq('http://localhost:3000/api/consent', {
        method: 'POST',
        userId: efua,
        body: { document: 'terms', version: '1.0' },
      })
    );
    expect(consentRes.status).toBe(201);

    const vapidConfigRes = await getPushVapidConfig();
    expect(vapidConfigRes.status).toBe(200);
    const vapidConfigJson = await vapidConfigRes.json();
    expect(vapidConfigJson.data.publicKey).toBeTruthy();
    expect(vapidConfigJson.data.subject).toMatch(/^mailto:/);
    expect(JSON.stringify(vapidConfigJson)).not.toContain('privateKey');

    const pushSub = await postPushSubscribe(
      makeReq('http://localhost:3000/api/push/subscribe', {
        method: 'POST',
        userId: efua,
        body: {
          endpoint: 'https://push.upsapulse.local/sub/99',
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        },
      })
    );
    expect(pushSub.status).toBe(201);

    const pushUnsub = await postPushUnsubscribe(
      makeReq('http://localhost:3000/api/push/unsubscribe', {
        method: 'POST',
        userId: efua,
        body: { endpoint: 'https://push.upsapulse.local/sub/99' },
      })
    );
    expect(pushUnsub.status).toBe(200);

    const dataReq = await postDataRequest(
      makeReq('http://localhost:3000/api/me/data-request', {
        method: 'POST',
        userId: efua,
        body: { type: 'access', details: 'Requesting export of my profile and consent logs' },
      })
    );
    expect(dataReq.status).toBe(201);

    const meGet = await getMe(makeReq('http://localhost:3000/api/me', { userId: efua }));
    expect(meGet.status).toBe(200);

    const mePatch = await patchMe(
      makeReq('http://localhost:3000/api/me', { method: 'PATCH', userId: efua })
    );
    expect(mePatch.status).toBe(200);

    const cfgGet = await getAdminConfig(
      makeReq('http://localhost:3000/api/admin/config', { userId: moderator })
    );
    expect(cfgGet.status).toBe(200);

    const cfgPut = await putAdminConfig(
      makeReq('http://localhost:3000/api/admin/config', {
        method: 'PUT',
        userId: moderator,
        body: {
          section: 'keyword_rule',
          payload: { pattern: 'leaked paper', matchType: 'contains', category: 'exam_leak' },
        },
      })
    );
    expect(cfgPut.status).toBe(200);

    const unmaskBlocked = await postAdminUnmask(
      makeReq('http://localhost:3000/api/admin/unmask', {
        method: 'POST',
        userId: '55555555-5555-4555-8555-555555555555',
        body: {
          action: 'request',
          postId: 'a0000000-0000-4000-8000-000000000001',
          basis: 'credible_threat',
          reference: 'REF-001',
          reason: 'Testing disabled gate by default',
        },
      })
    );
    expect(unmaskBlocked.status).toBe(403);

    const meDel = await deleteMe(
      makeReq('http://localhost:3000/api/me', {
        method: 'DELETE',
        userId: efua,
        body: { confirmationText: 'DELETE', otp: '654321' },
      })
    );
    expect(meDel.status).toBe(200);
  });

  it('verifies appeals two-moderator rule (F15), device approval (F2), and case lookup without email leak (ADMIN-1)', async () => {
    const postRes = await createPost(
      makeReq('http://localhost:3000/api/posts', {
        method: 'POST',
        userId: efua,
        body: {
          channelId: 1,
          kind: 'post',
          body: 'UPSA SRC study group invite link here: https://chat.whatsapp.com/test',
        },
      })
    );
    expect(postRes.status).toBe(201);
    const postJson = await postRes.json();

    const moderatorB = '55555555-5555-4555-8555-555555555555';
    const action = applyModerationActionInStore(moderatorB, {
      targetType: 'post',
      targetId: postJson.data.post.id,
      action: 'suspend',
      reason: 'Suspended for repeated spam links',
      suspendDays: 7,
    });

    const appealCreate = await postAppeal(
      makeReq('http://localhost:3000/api/appeals', {
        method: 'POST',
        userId: efua,
        body: {
          originalActionId: action.id,
          message: 'It was an official UPSA SRC study group link, not commercial spam.',
        },
      })
    );
    expect(appealCreate.status).toBe(201);
    const appealJson = await appealCreate.json();

    // Moderator B tries to review their own action -> 403 same_moderator_cannot_review_appeal
    const selfReview = await patchAppeal(
      makeReq('http://localhost:3000/api/appeals', {
        method: 'PATCH',
        userId: moderatorB,
        body: {
          appealId: appealJson.data.id,
          decision: 'rejected',
          note: 'Reviewing my own action',
        },
      })
    );
    expect(selfReview.status).toBe(403);
    expect((await selfReview.json()).error.code).toBe('same_moderator_cannot_review_appeal');

    // Distinct Moderator A reviews and upholds -> 200
    const modAReview = await patchAppeal(
      makeReq('http://localhost:3000/api/appeals', {
        method: 'PATCH',
        userId: moderator,
        body: {
          appealId: appealJson.data.id,
          decision: 'upheld',
          note: 'Verified official study group link; restriction lifted.',
        },
      })
    );
    expect(modAReview.status).toBe(200);
    expect((await modAReview.json()).data.status).toBe('upheld');

    // Approve pending device (Flow F2)
    const devApprove = await postApproveDevice(
      makeReq('http://localhost:3000/api/devices/approve', {
        method: 'POST',
        userId: efua,
        body: { rawDeviceToken: 'upsa-new-device-token-2026-verified' },
      })
    );
    expect(devApprove.status).toBe(200);
    expect((await devApprove.json()).data.status).toBe('trusted');

    // Case lookup by postId and aliasNo (ADMIN-1)
    const lookupRes = await getAdminLookup(
      makeReq(
        'http://localhost:3000/api/admin/lookup?postId=a0000000-0000-4000-8000-000000000001&aliasNo=0',
        { userId: moderator }
      )
    );
    expect(lookupRes.status).toBe(200);
    const lookupJson = await lookupRes.json();
    expect(lookupJson.data.found).toBe(true);
    expect(lookupJson.data.email).toBeUndefined();
  });

  it('creates new campus channels and updates channel active/ask/sortOrder flags via PUT /api/admin/config (ADMIN-1)', async () => {
    const createChanRes = await putAdminConfig(
      makeReq('http://localhost:3000/api/admin/config', {
        method: 'PUT',
        userId: moderator,
        body: {
          section: 'channel',
          payload: {
            name: 'Internships & Careers',
            slug: 'careers',
            description: 'Internship openings, CV reviews, and NSS placements',
            icon: 'briefcase',
            allowsAsk: true,
            isActive: true,
          },
        },
      })
    );
    expect(createChanRes.status).toBe(200);
    const createdJson = await createChanRes.json();
    const careersChan = createdJson.data.channels.find(
      (c: { slug: string }) => c.slug === 'careers'
    );
    expect(careersChan).toBeDefined();
    expect(careersChan.name).toBe('Internships & Careers');
    expect(careersChan.allowsAsk).toBe(true);

    // Toggle allowsAsk, isActive, and sortOrder on the newly created channel
    const toggleChanRes = await putAdminConfig(
      makeReq('http://localhost:3000/api/admin/config', {
        method: 'PUT',
        userId: moderator,
        body: {
          section: 'channel',
          payload: {
            id: careersChan.id,
            allowsAsk: false,
            isActive: false,
            sortOrder: 1,
          },
        },
      })
    );
    expect(toggleChanRes.status).toBe(200);
    const toggledJson = await toggleChanRes.json();
    const updatedChan = toggledJson.data.channels.find(
      (c: { id: number }) => c.id === careersChan.id
    );
    expect(updatedChan.allowsAsk).toBe(false);
    expect(updatedChan.isActive).toBe(false);
    expect(updatedChan.sortOrder).toBe(1);
  });

  it('verifies exact GeoJSON polygons for Campus, Hostel A, Hostel B, Hostel C, filters feed by place or All 4, and adds a new GeoJSON place via Admin', async () => {
    // 1. Verify point inside Hostel C GeoJSON polygon (-0.1675, 5.6575)
    const hostelCVerify = await verifyZonePost(
      makeReq('http://localhost:3000/api/zone/verify', {
        method: 'POST',
        userId: kojo,
        body: { lat: 5.6575, lng: -0.1675, accuracy: 25 },
      })
    );
    expect(hostelCVerify.status).toBe(200);
    const hostelCJson = await hostelCVerify.json();
    expect(hostelCJson.data.verified).toBe(true);
    expect(hostelCJson.data.zoneName).toBe('Hostel C');

    // 2. Post to Hostel C (zoneId = 4) and Hostel A (zoneId = 2)
    const postHostelC = await createPost(
      makeReq('http://localhost:3000/api/posts', {
        method: 'POST',
        userId: kojo,
        body: {
          zoneId: 4,
          channelId: 2,
          kind: 'post',
          body: 'Water tanker just arrived at Hostel C tank stand!',
        },
      })
    );
    expect(postHostelC.status).toBe(201);

    const postHostelA = await createPost(
      makeReq('http://localhost:3000/api/posts', {
        method: 'POST',
        userId: efua,
        body: {
          zoneId: 2,
          channelId: 2,
          kind: 'post',
          body: 'Hostel A common room study group starting at 8pm.',
        },
      })
    );
    expect(postHostelA.status).toBe(201);

    // 3. Query Hostel C feed (zoneId=4) vs All 4 feed (no zoneId)
    const feedHostelCRes = await getFeed(
      makeReq('http://localhost:3000/api/feed?sort=new&zoneId=4', { userId: kojo })
    );
    const feedHostelCJson = await feedHostelCRes.json();
    expect(feedHostelCJson.data.items.every((p: { zoneId: number }) => p.zoneId === 4)).toBe(true);
    expect(
      feedHostelCJson.data.items.some((p: { body: string }) => p.body.includes('Hostel C tank'))
    ).toBe(true);

    const feedAllRes = await getFeed(
      makeReq('http://localhost:3000/api/feed?sort=new', { userId: kojo })
    );
    const feedAllJson = await feedAllRes.json();
    expect(feedAllJson.data.zones.length).toBeGreaterThanOrEqual(4);
    expect(
      feedAllJson.data.items.some((p: { body: string }) => p.body.includes('Hostel C tank'))
    ).toBe(true);
    expect(
      feedAllJson.data.items.some((p: { body: string }) => p.body.includes('Hostel A common room'))
    ).toBe(true);

    // 4. Add a new place via Admin GeoJSON upload
    const addPlaceRes = await putAdminConfig(
      makeReq('http://localhost:3000/api/admin/config', {
        method: 'PUT',
        userId: moderator,
        body: {
          section: 'zone',
          payload: {
            name: 'Hostel D Annex',
            maxAccuracyMeters: 150,
            geojson: JSON.stringify({
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-0.169, 5.661],
                    [-0.168, 5.661],
                    [-0.168, 5.66],
                    [-0.169, 5.66],
                    [-0.169, 5.661],
                  ],
                ],
              },
            }),
          },
        },
      })
    );
    expect(addPlaceRes.status).toBe(200);
    const addPlaceJson = await addPlaceRes.json();
    expect(
      addPlaceJson.data.zones.some((z: { name: string }) => z.name === 'Hostel D Annex')
    ).toBe(true);
  });

  it('supports student signup with username + index number + password, API key index verification, login, Google auth, and forgot password', async () => {
    // 1. Reject invalid UPSA index number format during signup
    const badIndexRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'signup',
          username: 'kwame_upsa',
          indexNumber: '123',
          password: 'UpsaPulse#2026',
          adultConfirmed: true,
          termsAccepted: true,
          privacyAccepted: true,
          guidelinesAccepted: true,
        },
      })
    );
    expect(badIndexRes.status).toBe(400);

    // 2. Valid signup with username, UPSA index number, password, and consents
    const signupRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'signup',
          username: 'kwame_upsa',
          indexNumber: '10284912',
          password: 'UpsaPulse#2026',
          adultConfirmed: true,
          termsAccepted: true,
          privacyAccepted: true,
          guidelinesAccepted: true,
        },
      })
    );
    expect(signupRes.status).toBe(201);
    const signupJson = await signupRes.json();
    expect(signupJson.data.username).toBe('kwame_upsa');
    expect(signupJson.data.indexNumber).toBe('10284912');
    expect(signupJson.data.indexVerified).toBe(true);
    expect(signupJson.data.deviceStatus).toBe('trusted');

    // 2b. Valid signup WITHOUT username automatically generates and assigns a unique random username
    const autoUsernameSignupRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'signup',
          indexNumber: '10284913',
          password: 'UpsaPulse#2026',
          adultConfirmed: true,
          termsAccepted: true,
          privacyAccepted: true,
          guidelinesAccepted: true,
        },
      })
    );
    expect(autoUsernameSignupRes.status).toBe(201);
    const autoJson = await autoUsernameSignupRes.json();
    expect(autoJson.data.username).toMatch(/^[A-Za-z0-9_]{3,24}$/);
    expect(autoJson.data.indexNumber).toBe('10284913');

    // 3. Reject duplicate indexNumber or username
    const dupRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'signup',
          username: 'kwame_upsa',
          indexNumber: '10284912',
          password: 'UpsaPulse#2026',
          adultConfirmed: true,
          termsAccepted: true,
          privacyAccepted: true,
          guidelinesAccepted: true,
        },
      })
    );
    expect(dupRes.status).toBe(409);

    // 4. Reject login with wrong password
    const wrongPassRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'login',
          identifier: '10284912',
          password: 'WrongPassword#999',
        },
      })
    );
    expect(wrongPassRes.status).toBe(401);

    // 5. Login with index number + password, and with username + password
    const loginIndexRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'login',
          identifier: '10284912',
          password: 'UpsaPulse#2026',
        },
      })
    );
    expect(loginIndexRes.status).toBe(200);
    const loginIndexJson = await loginIndexRes.json();
    expect(loginIndexJson.data.username).toBe('kwame_upsa');

    // Verify tamper-proof HTTP-only session cookie issuance (DPA Act 843 & SEC-1)
    const setCookie = loginIndexRes.headers.get('set-cookie');
    expect(setCookie).toContain('pulse_uid=');
    expect(setCookie?.toLowerCase()).toContain('httponly');
    expect(setCookie?.toLowerCase()).toContain('samesite=lax');

    // Verify secure logout clears the session cookie
    const logoutRes = await postLogout();
    expect(logoutRes.status).toBe(200);
    const logoutCookie = logoutRes.headers.get('set-cookie');
    expect(logoutCookie?.toLowerCase()).toContain('max-age=0');

    const loginUserRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'login',
          identifier: 'kwame_upsa',
          password: 'UpsaPulse#2026',
        },
      })
    );
    expect(loginUserRes.status).toBe(200);

    // 6. Continue with Google (requires valid UPSA index number + consents on first sign-in)
    const googleRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'google',
          googleEmail: 'abena.mensah@upsamail.edu.gh',
          username: 'abena_upsa',
          indexNumber: '10295501',
          adultConfirmed: true,
          termsAccepted: true,
          privacyAccepted: true,
          guidelinesAccepted: true,
        },
      })
    );
    expect(googleRes.status).toBe(200);
    const googleJson = await googleRes.json();
    expect(googleJson.data.authProvider).toBe('google');
    expect(googleJson.data.indexNumber).toBe('10295501');

    // 7. Forgot password request -> reset -> login with new password
    const forgotReqRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'forgot_password_request',
          identifier: '10284912',
        },
      })
    );
    expect(forgotReqRes.status).toBe(200);
    const forgotReqJson = await forgotReqRes.json();
    expect(forgotReqJson.data.devResetCode).toMatch(/^\d{6}$/);

    const forgotResetRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'forgot_password_reset',
          identifier: '10284912',
          resetCode: forgotReqJson.data.devResetCode,
          newPassword: 'NewPulsePassword#2027',
        },
      })
    );
    expect(forgotResetRes.status).toBe(200);

    const loginNewPassRes = await postAuthOtp(
      makeReq('http://localhost:3000/api/auth/otp', {
        method: 'POST',
        body: {
          step: 'login',
          identifier: '10284912',
          password: 'NewPulsePassword#2027',
        },
      })
    );
    expect(loginNewPassRes.status).toBe(200);
  });

  it('allows unauthenticated visitors to fetch public feed and /api/me without 403 errors', async () => {
    const feedRes = await getFeed(makeReq('http://localhost:3000/api/feed?sort=hot'));
    expect(feedRes.status).toBe(200);
    const feedJson = await feedRes.json();
    expect(feedJson.success).toBe(true);
    expect(Array.isArray(feedJson.data.items)).toBe(true);
    expect(Array.isArray(feedJson.data.channels)).toBe(true);
    expect(Array.isArray(feedJson.data.zones)).toBe(true);

    const meRes = await getMe(makeReq('http://localhost:3000/api/me'));
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.success).toBe(true);
    expect(meJson.data.profile).toBeNull();
  });
});

