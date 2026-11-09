import { describe, it, expect } from 'vitest';
import {
  computeHotScore,
  screenContentText,
  verifyZonePoint,
  hashDeviceToken,
  isAllowedEmailDomain,
  generateThreadGlyph,
  formatThreadAlias,
  signSessionToken,
  verifySessionToken,
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
});

