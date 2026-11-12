import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeHotScore,
  screenContentText,
  detectRealPersonNames,
  maskPersonName,
  maskRealPersonNames,
  verifyZonePoint,
  hashDeviceToken,
  isAllowedEmailDomain,
  generateThreadGlyph,
  formatThreadAlias,
  signSessionToken,
  verifySessionToken,
  hashPassword,
  verifyPassword,
  checkRateLimit,
  resetRateLimitsForTests,
  isValidUpsaIndexNumber,
  verifyStudentIndexWithApiKey,
  maskStudentFullName,
  getSurnameHint,
  verifyStudentSurname,
} from '@/lib/domain/pulse-engine';
import {
  signUpConsentSchema,
  createPostSchema,
  createReplySchema,
  moderationActionSchema,
  deleteAccountSchema,
  unmaskRequestSchema,
} from '@/lib/validation/schemas';

describe('UPSA Pulse Core Domain & Security Engine (RED/GREEN TDD)', () => {
  describe('Hot Score Ranking Decay Formula', () => {
    it('computes (max(score, 0) + 1) / (age_hours + 2)^1.5 accurately', () => {
      const now = new Date('2026-11-04T12:00:00Z');
      const createdAt = new Date('2026-11-04T10:00:00Z'); // 2 hours old
      // (15 + 1) / (2 + 2)^1.5 = 16 / 8 = 2.0
      expect(computeHotScore(15, createdAt, now)).toBeCloseTo(2.0, 5);
    });

    it('clamps negative scores to 0 in numerator so downvoted posts decay cleanly', () => {
      const now = new Date('2026-11-04T12:00:00Z');
      const createdAt = new Date('2026-11-04T10:00:00Z'); // 2 hours old
      // (max(-4, 0) + 1) / (2 + 2)^1.5 = 1 / 8 = 0.125
      expect(computeHotScore(-4, createdAt, now)).toBeCloseTo(0.125, 5);
    });
  });

  describe('Email Domain Allow-list & Sign-up Consents (AUTH-1, AUTH-2)', () => {
    it('accepts allow-listed UPSA domains case-insensitively and rejects external domains', () => {
      expect(isAllowedEmailDomain('efua@upsa.edu.gh')).toBe(true);
      expect(isAllowedEmailDomain('KOJO@ST.UPSA.EDU.GH')).toBe(true);
      expect(isAllowedEmailDomain('hacker@gmail.com')).toBe(false);
      expect(isAllowedEmailDomain('spoof@upsa.edu.gh.evil.com')).toBe(false);
    });

    it('requires 18+ confirmation and all three separate unticked consents to be true', () => {
      const valid = signUpConsentSchema.safeParse({
        email: 'efua@st.upsa.edu.gh',
        adultConfirmed: true,
        termsAccepted: true,
        privacyAccepted: true,
        guidelinesAccepted: true,
      });
      expect(valid.success).toBe(true);

      const missingOne = signUpConsentSchema.safeParse({
        email: 'efua@st.upsa.edu.gh',
        adultConfirmed: true,
        termsAccepted: true,
        privacyAccepted: false,
        guidelinesAccepted: true,
      });
      expect(missingOne.success).toBe(false);
    });
  });

  describe('Zone Verification & Coordinate Non-Persistence', () => {
    it('accepts coordinates inside UPSA campus polygon with accuracy <= 150m', () => {
      const res = verifyZonePoint({ lat: 5.6605, lng: -0.1662, accuracy: 45 });
      expect(res.verified).toBe(true);
      expect(res.zoneId).toBe(1);
      expect(res).not.toHaveProperty('lat');
      expect(res).not.toHaveProperty('lng');
    });

    it('rejects readings with accuracy worse than 150m with accuracy_too_low', () => {
      const res = verifyZonePoint({ lat: 5.6605, lng: -0.1662, accuracy: 220 });
      expect(res.verified).toBe(false);
      expect(res.reason).toBe('accuracy_too_low');
    });

    it('rejects coordinates outside the UPSA zone polygon with not_in_zone', () => {
      const res = verifyZonePoint({ lat: 5.5500, lng: -0.2000, accuracy: 20 });
      expect(res.verified).toBe(false);
      expect(res.reason).toBe('not_in_zone');
    });
  });

  describe('Keyword & Pattern Pre-screen & Self-Harm Support Trigger (POST-3, MOD-2)', () => {
    it('holds posts containing Ghana phone numbers (doxxing regex)', () => {
      const result = screenContentText('Call his number 0244123456 right now');
      expect(result.status).toBe('held');
      expect(result.category).toBe('phone_number_doxxing');
      expect(result.showSupportCard).toBe(false);
    });

    it('holds exam leak phrases', () => {
      const result = screenContentText('I have exam questions for sale DM me');
      expect(result.status).toBe('held');
      expect(result.category).toBe('exam_leak');
    });

    it('holds self-harm statements and flags showSupportCard = true', () => {
      const result = screenContentText('I cannot cope anymore, I want to end my life tonight');
      expect(result.status).toBe('held');
      expect(result.category).toBe('self_harm');
      expect(result.showSupportCard).toBe(true);
    });

    it('publishes normal campus questions immediately', () => {
      const result = screenContentText('Where do Level 100 students submit medical forms?');
      expect(result.status).toBe('published');
      expect(result.showSupportCard).toBe(false);
    });

    it('detects real human names mentioned in confessions and holds them for anti-harassment review', () => {
      const confession1 = 'Confession: I really like Kofi Mensah from Level 300 Accounting';
      const names1 = detectRealPersonNames(confession1);
      expect(names1.length).toBeGreaterThan(0);
      expect(names1).toContain('Kofi Mensah');

      const screen1 = screenContentText(confession1);
      expect(screen1.status).toBe('held');
      expect(screen1.category).toBe('named_person_doxxing');

      const confession2 = 'Ama Boateng was crying at Hostel B yesterday';
      const names2 = detectRealPersonNames(confession2);
      expect(names2).toContain('Ama Boateng');

      const confession3 = 'I heard Dr. Osei is giving an unannounced test';
      const names3 = detectRealPersonNames(confession3);
      expect(names3.some((n) => n.toLowerCase().includes('osei'))).toBe(true);

      // Sentences using common nouns and words like faith, joy, hope must not be flagged
      expect(detectRealPersonNames('I have faith that we will pass the mid-sem exams')).toEqual([]);
      expect(detectRealPersonNames('I feel so much joy after finishing my assignment')).toEqual([]);
      expect(detectRealPersonNames('Which hostel has the best water supply?')).toEqual([]);
    });

    it('masks and hashes detected human names into A**** format to prevent harassment', () => {
      // Individual name masking
      expect(maskPersonName('Ama')).toBe('A****');
      expect(maskPersonName('Kofi')).toBe('K****');
      expect(maskPersonName('Mensah')).toBe('M*****');
      expect(maskPersonName('Kofi Mensah')).toBe('K**** M*****');
      expect(maskPersonName('Dr. Osei')).toBe('Dr. O****');
      expect(maskPersonName('Prof. Boateng')).toBe('Prof. B******');

      // Full sentences with name masking
      expect(maskRealPersonNames('Ama is my best friend')).toBe('A**** is my best friend');
      expect(maskRealPersonNames('I love Kofi Mensah from Level 200')).toBe(
        'I love K**** M***** from Level 200'
      );
      expect(maskRealPersonNames('I talked to Dr. Osei yesterday')).toBe(
        'I talked to Dr. O**** yesterday'
      );

      // Campus facility names named after people are preserved
      expect(maskRealPersonNames('The lecture is at Joshua Alabi block')).toBe(
        'The lecture is at Joshua Alabi block'
      );
      expect(maskRealPersonNames('We met near Ampomah building')).toBe(
        'We met near Ampomah building'
      );

      // General text without names is unchanged
      expect(maskRealPersonNames('I have faith we will pass the accounting exam')).toBe(
        'I have faith we will pass the accounting exam'
      );
    });
  });

  describe('Thread-Local Aliases & Geometric Glyphs', () => {
    it('formats alias_no 0 as OP and positive integers as Student n', () => {
      expect(formatThreadAlias(0)).toBe('OP');
      expect(formatThreadAlias(1)).toBe('Student 1');
      expect(formatThreadAlias(4)).toBe('Student 4');
    });

    it('generates deterministic glyph within a thread that differs across threads for the same alias_no', () => {
      const g1 = generateThreadGlyph('post-uuid-1111', 2);
      const g1Repeat = generateThreadGlyph('post-uuid-1111', 2);
      const g2OtherThread = generateThreadGlyph('post-uuid-9999', 2);

      expect(g1).toEqual(g1Repeat);
      expect(g1.seed).not.toBe(g2OtherThread.seed);
      expect(['diamond', 'triangle', 'square', 'hexagon', 'circle', 'octagon']).toContain(g1.shape);
    });
  });

  describe('HMAC Device Hashing & Boundary Validation Schemas', () => {
    it('produces deterministic 64-char hex HMAC without exposing raw token', () => {
      const hash = hashDeviceToken('raw-device-token-abc', 'pepper-secret-xyz');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).not.toContain('raw-device-token-abc');
    });

    it('enforces post 500-char limit, reply 300-char limit, and mandatory moderation reason >= 5 chars', () => {
      expect(createPostSchema.safeParse({ channelId: 1, kind: 'ask', body: 'a'.repeat(500) }).success).toBe(true);
      expect(createPostSchema.safeParse({ channelId: 1, kind: 'ask', body: 'a'.repeat(501) }).success).toBe(false);

      expect(createReplySchema.safeParse({ body: 'a'.repeat(300) }).success).toBe(true);
      expect(createReplySchema.safeParse({ body: 'a'.repeat(301) }).success).toBe(false);

      expect(
        moderationActionSchema.safeParse({
          targetType: 'post',
          targetId: '550e8400-e29b-41d4-a716-446655440000',
          action: 'remove',
          reason: 'doxx', // < 5 chars
        }).success
      ).toBe(false);

      expect(
        deleteAccountSchema.safeParse({
          confirmationText: 'DELETE',
          otp: '123456',
        }).success
      ).toBe(true);

      expect(
        unmaskRequestSchema.safeParse({
          action: 'approve',
          requestId: 1,
          requestedByUserId: '550e8400-e29b-41d4-a716-446655440001',
          actorUserId: '550e8400-e29b-41d4-a716-446655440001', // same user!
        }).success
      ).toBe(false);
    });
  });

  describe('Tamper-Proof Session Cookie Protection (DPA Act 843 & SEC-1)', () => {
    const pepper = 'upsa-test-session-secret-pepper-32-chars';
    const userId = '11111111-1111-4111-8111-111111111111';

    it('signs and verifies authentic session tokens using HMAC-SHA256', () => {
      const signed = signSessionToken(userId, pepper);
      expect(signed).toContain(`${userId}.`);
      const verified = verifySessionToken(signed, pepper);
      expect(verified).toBe(userId);
    });

    it('rejects tampered session tokens, modified signatures, and wrong peppers', () => {
      const signed = signSessionToken(userId, pepper);
      const [id, sig] = signed.split('.');

      // Tampered user ID with original signature
      const tamperedId = `${id?.slice(0, -1)}2.${sig}`;
      expect(verifySessionToken(tamperedId, pepper)).toBeNull();

      // Tampered signature
      const tamperedSig = `${id}.${sig?.slice(0, -2)}ff`;
      expect(verifySessionToken(tamperedSig, pepper)).toBeNull();

      // Wrong secret/pepper
      expect(verifySessionToken(signed, 'different-wrong-pepper-secret')).toBeNull();
    });

    it('gracefully handles raw UUID fallback for backwards compatibility', () => {
      expect(verifySessionToken(userId, pepper)).toBe(userId);
      expect(verifySessionToken('invalid-non-uuid-string', pepper)).toBeNull();
    });
  });

  describe('Password Hashing & Constant-Time Verification', () => {
    const pepper = 'upsa-test-pepper-secret-2026';

    it('hashes passwords using multi-round salted HMAC-SHA256 and verifies authentic passwords', () => {
      const rawPassword = 'StudentSecretPassword#2026';
      const hash1 = hashPassword(rawPassword, pepper);
      const hash2 = hashPassword(rawPassword, pepper);

      // Unique random salt per hash ensures hashes differ for identical passwords
      expect(hash1).not.toBe(hash2);
      expect(hash1).toContain('upsa_sha256$1200$');

      expect(verifyPassword(rawPassword, hash1, pepper)).toBe(true);
      expect(verifyPassword(rawPassword, hash2, pepper)).toBe(true);
      expect(verifyPassword('WrongPassword#123', hash1, pepper)).toBe(false);
    });
  });

  describe('UPSA Student Index Verification (HMS Hostel Verification API Integration)', () => {
    it('validates 8 to 10 digit UPSA index number formats strictly starting with 10 or programme codes', () => {
      expect(isValidUpsaIndexNumber('10298545')).toBe(true);
      expect(isValidUpsaIndexNumber('10297545')).toBe(true);
      expect(isValidUpsaIndexNumber('10284912')).toBe(true);
      expect(isValidUpsaIndexNumber('PS/ITC/22/0001')).toBe(true);
      expect(isValidUpsaIndexNumber('BACS220145')).toBe(true);

      // Random non-UPSA numbers must strictly fail format check
      expect(isValidUpsaIndexNumber('12345678')).toBe(false);
      expect(isValidUpsaIndexNumber('99999999')).toBe(false);
      expect(isValidUpsaIndexNumber('55555555')).toBe(false);
      expect(isValidUpsaIndexNumber('123')).toBe(false);
      expect(isValidUpsaIndexNumber('not-an-index')).toBe(false);
    });

    it('verifies student indices and returns studentName when found by external endpoint', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const urlStr = String(input);
        if (urlStr.includes('student_id=10298545')) {
          return new Response('JERRY BROWN DANKWA', { status: 200 });
        }
        if (urlStr.includes('student_id=10297545')) {
          return new Response('Please Check your Student ID', { status: 200 });
        }
        return new Response('Please Check your Student ID', { status: 200 });
      }) as typeof fetch;

      try {
        const found = await verifyStudentIndexWithApiKey(
          '10298545',
          undefined,
          'https://apply.upsahostels.com/index.php?r=applications/verify',
          undefined,
          'Dankwa'
        );
        expect(found.valid).toBe(true);
        expect(found.studentName).toBe('JERRY BROWN DANKWA');
        expect(found.verificationMode).toBe('external_api');

        // Not found index
        const notFound = await verifyStudentIndexWithApiKey(
          '10297545',
          undefined,
          'https://apply.upsahostels.com/index.php?r=applications/verify'
        );
        expect(notFound.valid).toBe(false);
        expect(notFound.studentName).toBeUndefined();
        expect(notFound.reason).toBe('index_not_found_on_campus_records');

        // Random non-school index number rejected immediately
        const randomInvalid = await verifyStudentIndexWithApiKey('99999999');
        expect(randomInvalid.valid).toBe(false);
        expect(randomInvalid.reason).toBe('invalid_index_format');

        // Proxy configuration parameter routing
        const proxyVerified = await verifyStudentIndexWithApiKey(
          '10298545',
          undefined,
          'https://apply.upsahostels.com/index.php?r=applications/verify',
          'http://proxy.campus.internal:8080',
          'Dankwa'
        );
        expect(proxyVerified.valid).toBe(true);
        expect(proxyVerified.studentName).toBe('JERRY BROWN DANKWA');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles proxy fetch configuration module cleanly', async () => {
      const { fetchWithOptionalProxy } = await import('@/lib/server/proxy-fetch');
      expect(typeof fetchWithOptionalProxy).toBe('function');
    });

    describe('Masked Surname Challenge (Impersonation Protection)', () => {
      it('masks full names and extracts surname hints without leaking full identity', () => {
        expect(maskStudentFullName('JERRY BROWN DANKWA')).toBe('J**** B**** D*****');
        expect(maskStudentFullName('GILBERT MATSI')).toBe('G****** M****');
        expect(maskStudentFullName('A B')).toBe('A B');
        expect(getSurnameHint('JERRY BROWN DANKWA')).toBe('D');
        expect(getSurnameHint('GILBERT MATSI')).toBe('M');
      });

      it('verifies student surname case-insensitively against university records', () => {
        expect(verifyStudentSurname('JERRY BROWN DANKWA', 'Dankwa')).toBe(true);
        expect(verifyStudentSurname('JERRY BROWN DANKWA', 'dankwa')).toBe(true);
        expect(verifyStudentSurname('JERRY BROWN DANKWA', 'DANKWA')).toBe(true);
        expect(verifyStudentSurname('JERRY BROWN DANKWA', 'Brown')).toBe(true);
        expect(verifyStudentSurname('JERRY BROWN DANKWA', 'Jerry')).toBe(true);
        expect(verifyStudentSurname('JERRY BROWN DANKWA', 'Mensah')).toBe(false);
        expect(verifyStudentSurname('JERRY BROWN DANKWA', '')).toBe(false);
        expect(verifyStudentSurname('JERRY BROWN DANKWA', 'D')).toBe(false); // Min 2 chars
      });

      it('requires surname confirmation before granting full verification on index check', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => {
          return new Response('JERRY BROWN DANKWA', { status: 200 });
        }) as typeof fetch;

        try {
          // 1. Without surname: returns masked challenge, does not reveal full studentName
          const initial = await verifyStudentIndexWithApiKey(
            '10298545',
            undefined,
            'https://apply.upsahostels.com/index.php?r=applications/verify'
          );
          expect(initial.valid).toBe(true);
          expect(initial.challengeRequired).toBe(true);
          expect(initial.surnameVerified).toBe(false);
          expect(initial.maskedName).toBe('J**** B**** D*****');
          expect(initial.surnameHint).toBe('D');
          expect(initial.studentName).toBeUndefined();

          // 2. With wrong surname attempt: strictly rejected
          const wrong = await verifyStudentIndexWithApiKey(
            '10298545',
            undefined,
            'https://apply.upsahostels.com/index.php?r=applications/verify',
            undefined,
            'Asare'
          );
          expect(wrong.valid).toBe(false);
          expect(wrong.surnameVerified).toBe(false);
          expect(wrong.reason).toBe('surname_mismatch');

          // 3. With correct surname: verified
          const correct = await verifyStudentIndexWithApiKey(
            '10298545',
            undefined,
            'https://apply.upsahostels.com/index.php?r=applications/verify',
            undefined,
            'Dankwa'
          );
          expect(correct.valid).toBe(true);
          expect(correct.surnameVerified).toBe(true);
          expect(correct.challengeRequired).toBe(false);
          expect(correct.studentName).toBe('JERRY BROWN DANKWA');
        } finally {
          globalThis.fetch = originalFetch;
        }
      });
    });
  });

  describe('Sliding-Window Auth Rate Limiter', () => {
    beforeEach(() => {
      resetRateLimitsForTests();
    });

    it('allows requests within limit and throttles subsequent requests with retryAfterSeconds', () => {
      const key = 'test-login-key';
      // 3 attempts allowed within 10 seconds
      expect(checkRateLimit(key, 3, 10_000).allowed).toBe(true);
      expect(checkRateLimit(key, 3, 10_000).allowed).toBe(true);
      expect(checkRateLimit(key, 3, 10_000).allowed).toBe(true);

      const blocked = checkRateLimit(key, 3, 10_000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(10);
    });
  });

  describe('Deleted Messages and Users Security Audit Archive (Ghana DPA Act 843)', () => {
    const adminUserId = '44444444-4444-4444-8444-444444444444';
    const studentUserId = '11111111-1111-4111-8111-111111111111';

    beforeEach(async () => {
      const { resetPulseStoreForTests, verifyUserZoneInStore } = await import('@/lib/store/pulse-store');
      resetPulseStoreForTests();
      verifyUserZoneInStore(studentUserId, { lat: 5.6605, lng: -0.1662, accuracy: 20 });
    });

    it('archives deleted posts into deleted_messages_audit with original body and author', async () => {
      const { createPostInStore, deleteOwnPostInStore, getSecurityAuditLogsFromStore } = await import(
        '@/lib/store/pulse-store'
      );

      const post = createPostInStore(studentUserId, {
        channelId: 1,
        kind: 'post',
        body: 'Audit Test: This post will be deleted for security testing.',
      });

      deleteOwnPostInStore(studentUserId, post.id, 'author_requested_removal');

      const audit = getSecurityAuditLogsFromStore(adminUserId, { type: 'deleted_messages' });
      expect(audit.deletedMessages.length).toBeGreaterThanOrEqual(1);

      const archived = audit.deletedMessages.find((m) => m.originalId === post.id);
      expect(archived).toBeDefined();
      expect(archived?.messageType).toBe('post');
      expect(archived?.authorId).toBe(studentUserId);
      expect(archived?.body).toContain('Audit Test: This post will be deleted');
      expect(archived?.deletionReason).toBe('author_requested_removal');
      expect(archived?.deletedBy).toBe(studentUserId);
      expect(archived?.deletedAt).toBeDefined();

      // Ensure system audit log captured the event
      const allAudit = getSecurityAuditLogsFromStore(adminUserId, { type: 'system' });
      expect(allAudit.systemAuditLogs.some((l) => l.event === 'post_deleted_by_author')).toBe(true);
    });

    it('archives moderator removed posts and replies with exact violation reason', async () => {
      const { createPostInStore, applyModerationActionInStore, getSecurityAuditLogsFromStore } =
        await import('@/lib/store/pulse-store');

      const post = createPostInStore(studentUserId, {
        channelId: 1,
        kind: 'post',
        body: 'Post to be removed by moderator for exam question sharing.',
      });

      applyModerationActionInStore(adminUserId, {
        targetType: 'post',
        targetId: post.id,
        action: 'remove',
        reason: 'Violation of Academic Integrity: leaking exam question',
      });

      const audit = getSecurityAuditLogsFromStore(adminUserId, { type: 'deleted_messages' });
      const archived = audit.deletedMessages.find((m) => m.originalId === post.id);
      expect(archived).toBeDefined();
      expect(archived?.deletedBy).toBe(adminUserId);
      expect(archived?.deletionReason).toContain('moderator_removed');
      expect(archived?.deletionReason).toContain('Violation of Academic Integrity');
    });

    it('archives deleted user accounts into deleted_users_audit before purging data', async () => {
      const { deleteAccountInStore, getSecurityAuditLogsFromStore } = await import(
        '@/lib/store/pulse-store'
      );

      deleteAccountInStore(studentUserId, {
        confirmationText: 'DELETE',
        otp: '123456',
        reason: 'Student graduated and requested account deletion',
      });

      const audit = getSecurityAuditLogsFromStore(adminUserId, { type: 'deleted_users' });
      expect(audit.deletedUsers.length).toBeGreaterThanOrEqual(1);

      const archivedUser = audit.deletedUsers.find((u) => u.userId === studentUserId);
      expect(archivedUser).toBeDefined();
      expect(archivedUser?.username).toBe('efua_upsa');
      expect(archivedUser?.deletedBy).toBe(studentUserId);
      expect(archivedUser?.deletionReason).toBe('Student graduated and requested account deletion');
      expect(archivedUser?.deletedAt).toBeDefined();

      // Ensure unauthorized user cannot read security audit records
      expect(() => getSecurityAuditLogsFromStore('33333333-3333-4333-8333-333333333333')).toThrow(
        'forbidden'
      );
    });
  });
});

