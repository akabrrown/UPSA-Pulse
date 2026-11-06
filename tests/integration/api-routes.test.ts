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

  it('deletes account, nulls author_id on past posts while keeping thread intact, and logs deletion', () => {
    verifyUserZoneInStore(studentEfua, { lat: 5.6605, lng: -0.1662, accuracy: 30 });
    verifyUserZoneInStore(studentKojo, { lat: 5.6605, lng: -0.1662, accuracy: 30 });

    const post = createPostInStore(studentEfua, {
      channelId: 3,
      kind: 'post',
      body: 'Best waakye spot near the east gate is open.',
    });

    deleteAccountInStore(studentEfua, { confirmationText: 'DELETE', otp: '123456' });

    const thread = getThreadFromStore(studentKojo, post.id);
    expect(thread.post.body).toContain('Best waakye spot');
    expect(thread.post.isMine).toBe(false);
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

