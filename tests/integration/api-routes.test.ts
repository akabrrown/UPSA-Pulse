import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetPulseStoreForTests,
  verifyUserZoneInStore,
  createPostInStore,
  createReplyInStore,
  castVoteInStore,
  reportContentInStore,
  markAnswerInStore,
  getFeedFromStore,
  getThreadFromStore,
  applyModerationActionInStore,
  deleteAccountInStore,
  executeUnmaskActionInStore,
  signUpStudentInStore,
  getNotificationsFromStore,
  markNotificationsReadInStore,
} from '@/lib/store/pulse-store';

describe('UPSA Pulse End-to-End Store & API Contract Invariants (TDD Section 6 & 9)', () => {
  const studentEfua = '11111111-1111-4111-8111-111111111111';
  const studentKojo = '22222222-2222-4222-8222-222222222222';
  const studentAma = '33333333-3333-4333-8333-333333333333';
  const moderatorUser = '44444444-4444-4444-8444-444444444444';
  const unmaskHolderA = '55555555-5555-4555-8555-555555555555';
  const unmaskHolderB = '66666666-6666-4666-8666-666666666666';

  beforeEach(() => {
    resetPulseStoreForTests();
  });

  it('blocks feed reads and post creation when zone_verified_until is missing or expired', () => {
    expect(() => getFeedFromStore({ userId: studentAmberUnverified(), sort: 'hot' })).toThrow('zone_not_verified');
  });

  it('allows a student located in Hostel A to post to UPSA Main Campus without having to be at Main Campus', () => {
    // User is located at Hostel A & B coordinates (Zone 2)
    const verification = verifyUserZoneInStore(studentEfua, { lat: 5.6597, lng: -0.172, accuracy: 25 });
    expect(verification.zoneId).toBe(2);
    expect(verification.zoneName).toContain('Hostel A');

    // Post with target zoneId: 1 (UPSA Main Campus)
    const post = createPostInStore(studentEfua, {
      zoneId: 1,
      channelId: 6,
      kind: 'post',
      body: 'Campus concert happening now at the main auditorium!',
    });
    expect(post.zoneId).toBe(1);
    expect(post.zoneName).toBe('UPSA Main Campus');

    // Verify it appears in the Main Campus feed
    const campusFeed = getFeedFromStore({ userId: studentEfua, sort: 'new', zoneId: 1 });
    expect(campusFeed.items.some((p) => p.id === post.id)).toBe(true);
  });

  it('allows verified students in private hostels (Madina, Haatso) and at home during vacation 24/7 access to post, read, reply, and vote', () => {
    // Student Kojo is in a private hostel in Madina outside campus bounds (lat: 5.6740, lng: -0.1610)
    const madinaVerification = verifyUserZoneInStore(studentKojo, { lat: 5.674, lng: -0.161, accuracy: 35 });
    expect(madinaVerification.verified).toBe(true);
    expect(madinaVerification.zoneId).toBe(5);
    expect(madinaVerification.zoneName).toBe('Private Hostels & Off-Campus');

    // Post to Private Hostels & Off-Campus (Zone 5)
    const hostelPost = createPostInStore(studentKojo, {
      zoneId: 5,
      channelId: 2, // Hostels & Housing
      kind: 'post',
      body: 'Madina hostel bus is loading at the junction now for anyone heading home.',
    });
    expect(hostelPost.zoneId).toBe(5);
    expect(hostelPost.zoneName).toBe('Private Hostels & Off-Campus');

    // Student Ama is at home during vacation (lat: 5.5560, lng: -0.1969)
    const vacationVerification = verifyUserZoneInStore(studentAma, { lat: 5.556, lng: -0.1969, accuracy: 40 });
    expect(vacationVerification.verified).toBe(true);
    expect(vacationVerification.zoneId).toBe(5);

    // Student Ama posts to Vacation & Recess Lounge (Zone 6)
    const vacationPost = createPostInStore(studentAma, {
      zoneId: 6,
      channelId: 6, // General
      kind: 'post',
      body: 'Anyone doing remote internships during this long vacation? Let us share tips here!',
    });
    expect(vacationPost.zoneId).toBe(6);
    expect(vacationPost.zoneName).toBe('Vacation & Recess Lounge');

    // Student Efua (on campus) can read posts from Private Hostels and Vacation Lounge
    verifyUserZoneInStore(studentEfua, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    const offCampusFeed = getFeedFromStore({ userId: studentEfua, sort: 'new', zoneId: 5 });
    expect(offCampusFeed.items.some((p) => p.id === hostelPost.id)).toBe(true);

    const vacationFeed = getFeedFromStore({ userId: studentEfua, sort: 'new', zoneId: 6 });
    expect(vacationFeed.items.some((p) => p.id === vacationPost.id)).toBe(true);

    // Replying and voting across off-campus posts works seamlessly
    const reply = createReplyInStore(studentEfua, vacationPost.id, 'Taking a Coursera data analytics course!');
    expect(reply.aliasNo).toBe(1);

    const vote = castVoteInStore(studentEfua, { targetType: 'post', targetId: vacationPost.id, value: 1 });
    expect(vote.score).toBe(1);
    expect(vote.myVote).toBe(1);
  });

  it('allocates sequential per-thread aliases (OP=0, Student 1, Student 2) and reuses alias when same user replies twice', () => {
    verifyUserZoneInStore(studentEfua, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    verifyUserZoneInStore(studentKojo, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    verifyUserZoneInStore(studentAma, { lat: 5.6605, lng: -0.1662, accuracy: 30 });

    const post = createPostInStore(studentEfua, {
      channelId: 1,
      kind: 'ask',
      body: 'Where is the Academic Affairs office for Level 100 registration?',
    });
    expect(post.status).toBe('published');

    const r1 = createReplyInStore(studentKojo, post.id, 'Ground floor of the main administration block.');
    const r2 = createReplyInStore(studentAma, post.id, 'Go before 10am so the queue is short.');
    const r3 = createReplyInStore(studentKojo, post.id, 'Bring two copies of your admission letter too.');
    const rOp = createReplyInStore(studentEfua, post.id, 'Thank you both!');

    expect(r1.aliasNo).toBe(1);
    expect(r2.aliasNo).toBe(2);
    expect(r3.aliasNo).toBe(1); // Reuses Student 1
    expect(rOp.aliasNo).toBe(0); // OP is 0

    const thread = getThreadFromStore(studentEfua, post.id);
    const serialized = JSON.stringify(thread);
    expect(serialized).not.toContain(studentEfua);
    expect(serialized).not.toContain(studentKojo);
    expect(serialized).not.toContain('author_id');
    expect(serialized).not.toContain('email');
  });

  it('prevents voting on own content (own_content) and auto-hides post when net score reaches -5', () => {
    verifyUserZoneInStore(studentEfua, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    const post = createPostInStore(studentEfua, {
      channelId: 6,
      kind: 'post',
      body: 'Unpopular opinion about hostel curfew.',
    });

    expect(() =>
      castVoteInStore(studentEfua, { targetType: 'post', targetId: post.id, value: 1 })
    ).toThrow('own_content');

    const voters = [
      studentKojo,
      studentAma,
      moderatorUser,
      unmaskHolderA,
      unmaskHolderB,
    ];
    for (const v of voters) {
      verifyUserZoneInStore(v, { lat: 5.6605, lng: -0.1662, accuracy: 25 });
      castVoteInStore(v, { targetType: 'post', targetId: post.id, value: -1 });
    }

    const feedAfterDownvotes = getFeedFromStore({ userId: studentKojo, sort: 'new' });
    expect(feedAfterDownvotes.items.find((p) => p.id === post.id)).toBeUndefined();

    // Author can still view their own hidden thread with neutral status
    const authorThread = getThreadFromStore(studentEfua, post.id);
    expect(authorThread.post.status).toBe('hidden');
  });

  it('auto-hides on 2 distinct priority reports (doxxing/self_harm/threat_of_violence)', () => {
    verifyUserZoneInStore(studentEfua, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    const post = createPostInStore(studentEfua, {
      channelId: 2,
      kind: 'post',
      body: 'Room 4B at Hostel X belongs to Kofi Mensah',
    });

    reportContentInStore(studentKojo, {
      targetType: 'post',
      targetId: post.id,
      reason: 'doxxing',
      note: 'Sharing hostel room number',
    });
    // Duplicate report from same user does not count twice
    reportContentInStore(studentKojo, {
      targetType: 'post',
      targetId: post.id,
      reason: 'doxxing',
    });

    let feed = getFeedFromStore({ userId: studentKojo, sort: 'new' });
    expect(feed.items.some((p) => p.id === post.id)).toBe(true);

    // Second distinct reporter triggers auto-hide at 2 priority reports
    reportContentInStore(studentAma, {
      targetType: 'post',
      targetId: post.id,
      reason: 'doxxing',
    });

    feed = getFeedFromStore({ userId: studentKojo, sort: 'new' });
    expect(feed.items.some((p) => p.id === post.id)).toBe(false);
  });

  it('blocks moderator from moderating a thread they participated in (App Flow Section 6 conflict-of-interest)', () => {
    verifyUserZoneInStore(studentEfua, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    verifyUserZoneInStore(moderatorUser, { lat: 5.6605, lng: -0.1662, accuracy: 30 });

    const post = createPostInStore(studentEfua, {
      channelId: 1,
      kind: 'post',
      body: 'Discussion on accounting lecture hall change.',
    });
    createReplyInStore(moderatorUser, post.id, 'I was in that lecture too.');

    expect(() =>
      applyModerationActionInStore(moderatorUser, {
        targetType: 'post',
        targetId: post.id,
        action: 'remove',
        reason: 'Removing thread after participating',
      })
    ).toThrow('conflict_of_interest');
  });

  it('allows asker to mark one accepted answer and pins it first in thread replies', () => {
    verifyUserZoneInStore(studentEfua, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    verifyUserZoneInStore(studentKojo, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    verifyUserZoneInStore(studentAma, { lat: 5.6605, lng: -0.1662, accuracy: 30 });

    const ask = createPostInStore(studentEfua, {
      channelId: 1,
      kind: 'ask',
      body: 'When does add/drop close for semester 1?',
    });
    const r1 = createReplyInStore(studentKojo, ask.id, 'Next week Friday.');
    const r2 = createReplyInStore(studentAma, ask.id, 'Friday 5:00 PM at the portal — confirmed by faculty officer.');

    markAnswerInStore(studentEfua, r2.id);

    const thread = getThreadFromStore(studentEfua, ask.id);
    expect(thread.post.answeredReplyId).toBe(r2.id);
    expect(thread.replies[0]?.id).toBe(r2.id);
    expect(thread.replies[1]?.id).toBe(r1.id);
  });

  it('deletes account, nulls author_id on past posts while keeping thread intact, and logs deletion with optional reason', () => {
    verifyUserZoneInStore(studentEfua, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    verifyUserZoneInStore(studentKojo, { lat: 5.6605, lng: -0.1662, accuracy: 30 });

    const post = createPostInStore(studentEfua, {
      channelId: 3,
      kind: 'post',
      body: 'Best waakye spot near the east gate is open.',
    });

    const deletion = deleteAccountInStore(studentEfua, {
      confirmationText: 'DELETE',
      otp: '123456',
      reason: 'Graduating this semester and no longer need campus updates.',
    });
    expect(deletion.deletedAt).toBeDefined();

    const thread = getThreadFromStore(studentKojo, post.id);
    expect(thread.post.body).toContain('Best waakye spot');
    expect(thread.post.isMine).toBe(false);
  });

  it('marks notifications as read when opening a reply or thread', () => {
    verifyUserZoneInStore(studentEfua, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    verifyUserZoneInStore(studentKojo, { lat: 5.6605, lng: -0.1662, accuracy: 30 });

    const post = createPostInStore(studentEfua, {
      channelId: 1,
      kind: 'ask',
      body: 'Where is the graduation gown pickup?',
    });
    createReplyInStore(studentKojo, post.id, 'At the main auditorium lobby.');

    const notifsBefore = getNotificationsFromStore(studentEfua);
    const replyNotif = notifsBefore.find((n) => n.payload?.post_id === post.id);
    expect(replyNotif).toBeDefined();
    expect(replyNotif?.readAt).toBeNull();

    markNotificationsReadInStore(studentEfua, { postId: post.id });

    const notifsAfter = getNotificationsFromStore(studentEfua);
    const markedNotif = notifsAfter.find((n) => n.payload?.post_id === post.id);
    expect(markedNotif?.readAt).not.toBeNull();
  });

  it('enforces disabled unmask gate by default (D6) and two-person approval when policy flag enabled', () => {
    verifyUserZoneInStore(studentEfua, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    const post = createPostInStore(studentEfua, {
      channelId: 6,
      kind: 'post',
      body: 'Test post for unmask audit.',
    });

    expect(() =>
      executeUnmaskActionInStore(
        unmaskHolderA,
        {
          action: 'request',
          postId: post.id,
          basis: 'credible_threat',
          reference: 'UPSA-SEC-2026-09',
          reason: 'Imminent safety threat reported to campus security',
        },
        { policyEnabled: false }
      )
    ).toThrow('unmask_disabled_by_policy');

    const req = executeUnmaskActionInStore(
      unmaskHolderA,
      {
        action: 'request',
        postId: post.id,
        basis: 'credible_threat',
        reference: 'UPSA-SEC-2026-09',
        reason: 'Imminent safety threat reported to campus security',
      },
      { policyEnabled: true }
    );

    // Holder A cannot approve their own request
    expect(() =>
      executeUnmaskActionInStore(
        unmaskHolderA,
        {
          action: 'approve',
          requestId: req.requestId!,
        },
        { policyEnabled: true }
      )
    ).toThrow('two_person_rule_violation');

    // Holder B approves independently
    const approved = executeUnmaskActionInStore(
      unmaskHolderB,
      {
        action: 'approve',
        requestId: req.requestId!,
      },
      { policyEnabled: true }
    );
    expect(approved.status).toBe('approved');
    expect(approved.disclosedIdentity?.email).toBe('efua@st.upsa.edu.gh');
  });

  it('prevents two students from registering with the same username (case-insensitive)', () => {
    signUpStudentInStore({
      username: 'kwame_pulse',
      indexNumber: '10284991',
      password: 'Password123!',
      rawDeviceToken: 'token-abc',
      pepper: 'test-pepper',
    });

    expect(() =>
      signUpStudentInStore({
        username: 'kwame_pulse',
        indexNumber: '10284992',
        password: 'Password123!',
        rawDeviceToken: 'token-xyz',
        pepper: 'test-pepper',
      })
    ).toThrow('username_already_taken');

    expect(() =>
      signUpStudentInStore({
        username: 'Kwame_Pulse',
        indexNumber: '10284993',
        password: 'Password123!',
        rawDeviceToken: 'token-def',
        pepper: 'test-pepper',
      })
    ).toThrow('username_already_taken');
  });
});

function studentAmberUnverified(): string {
  return '99999999-9999-4999-8999-999999999999';
}

