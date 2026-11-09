import { z } from 'zod';

export const postKindSchema = z.enum(['post', 'ask']);
export type PostKind = z.infer<typeof postKindSchema>;

export const contentStatusSchema = z.enum(['published', 'held', 'hidden', 'removed', 'archived']);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const userStatusSchema = z.enum(['active', 'suspended', 'banned', 'deleted']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const targetTypeSchema = z.enum(['post', 'reply']);
export type TargetType = z.infer<typeof targetTypeSchema>;

export const reportReasonSchema = z.enum([
  'self_harm',
  'threat_of_violence',
  'doxxing',
  'harassment',
  'hate',
  'sexual',
  'exam_leak',
  'false_claim',
  'spam',
  'other',
]);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const feedSortSchema = z.enum(['hot', 'new', 'top24']);
export type FeedSort = z.infer<typeof feedSortSchema>;

// AUTH-1 & AUTH-2: Student sign-in with UPSA student confirmation and 3 separate legal consents
export const signUpConsentSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  adultConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm that you are a current UPSA student.' }),
  }),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service.' }),
  }),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Privacy Notice.' }),
  }),
  guidelinesAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Community Guidelines.' }),
  }),
});

export const otpVerifySchema = z.object({
  email: z.string().trim().email(),
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit verification code'),
  deviceToken: z.string().min(8).max(256).optional(),
});

export const studentSignUpSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(24, 'Username cannot exceed 24 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only use letters, numbers, and underscores')
    .optional(),
  indexNumber: z
    .string()
    .trim()
    .min(6, 'Enter your UPSA student index number')
    .max(24, 'Index number is too long'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters'),
  email: z.string().trim().email().optional().or(z.literal('')).or(z.null()),
  adultConfirmed: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm that you are a current UPSA student.' }),
  }),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service.' }),
  }),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Privacy Notice.' }),
  }),
  guidelinesAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Community Guidelines.' }),
  }),
  deviceToken: z.string().min(8).max(256).optional(),
});

export const studentLoginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your UPSA index number or username').max(64),
  password: z.string().min(1, 'Enter your password').max(128),
  deviceToken: z.string().min(8).max(256).optional(),
});

export const googleAuthSchema = z.object({
  googleEmail: z.string().trim().email('Enter a valid Google email'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(24, 'Username cannot exceed 24 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only use letters, numbers, and underscores')
    .optional(),
  indexNumber: z.string().trim().min(6).max(24).optional(),
  adultConfirmed: z.boolean().optional(),
  termsAccepted: z.boolean().optional(),
  privacyAccepted: z.boolean().optional(),
  guidelinesAccepted: z.boolean().optional(),
  deviceToken: z.string().min(8).max(256).optional(),
});

export const forgotPasswordRequestSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your UPSA index number or username').max(64),
});

export const forgotPasswordResetSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your UPSA index number or username').max(64),
  resetCode: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit recovery code'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters'),
});

// ZONE-1 & ZONE-2: Position verification input
export const zoneVerifySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().positive().max(10000),
});

// FEED-1 & FEED-2: Feed query parameters
export const feedQuerySchema = z.object({
  sort: feedSortSchema.default('hot'),
  zoneId: z.coerce.number().int().positive().optional(),
  channelId: z.coerce.number().int().positive().optional(),
  kind: postKindSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// POST-1: Compose text post up to 500 chars
export const createPostSchema = z.object({
  zoneId: z.number().int().positive().optional(),
  channelId: z.number().int().positive(),
  kind: postKindSchema.default('post'),
  body: z
    .string()
    .trim()
    .min(1, 'Post cannot be empty')
    .max(500, 'Post cannot exceed 500 characters'),
});

// REPLY-1: Flat replies up to 300 chars
export const createReplySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Reply cannot be empty')
    .max(300, 'Reply cannot exceed 300 characters'),
});

// VOTE-1: One vote per item (-1, 0, or 1)
export const castVoteSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().uuid(),
  value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

// REPORT-1: Report post or reply with reason and optional 300-char note
export const reportContentSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().uuid(),
  reason: reportReasonSchema,
  note: z.string().trim().max(300).optional(),
});

// LEGAL-1 & F14: Record acceptance of a document version
export const recordConsentSchema = z.object({
  document: z.enum(['terms', 'privacy', 'community_guidelines']),
  version: z.string().trim().min(1).max(20),
});

// ACCT-2 & F13: Data access or correction request
export const dataRequestSchema = z.object({
  type: z.enum(['access', 'correction']),
  details: z.string().trim().min(5, 'Please describe your request').max(1000),
});

// Delete account confirmation (typing DELETE + 6-digit OTP + optional reason)
export const deleteAccountSchema = z.object({
  confirmationText: z.literal('DELETE', {
    errorMap: () => ({ message: 'Type DELETE in capital letters to confirm.' }),
  }),
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit OTP code'),
  reason: z.string().trim().max(1000).optional(),
});

// F15: Submit suspension or ban appeal
export const submitAppealSchema = z.object({
  originalActionId: z.number().int().positive(),
  message: z.string().trim().min(5).max(500),
});

// F15: Moderator review of an appeal (cannot be the same moderator who issued original action)
export const decideAppealSchema = z.object({
  appealId: z.number().int().positive(),
  decision: z.enum(['upheld', 'rejected']),
  note: z.string().trim().min(5, 'Decision note must be at least 5 characters').max(500),
});

// F2: Approve a pending device and revoke previous device session
export const approveDeviceSchema = z.object({
  rawDeviceToken: z.string().trim().min(8).max(256),
});

// NOTIF-1 & F11: Web Push subscription
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

// MOD-1 & F10: Admin moderation action with mandatory reason >= 5 chars
export const moderationActionSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().uuid(),
  action: z.enum(['restore', 'remove', 'warn', 'suspend', 'ban', 'unban', 'dismiss_report']),
  reason: z.string().trim().min(5, 'A reason of at least 5 characters is mandatory').max(500),
  suspendDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).optional(),
});

// ADMIN-1: Admin configuration update
export const adminConfigUpdateSchema = z.object({
  section: z.enum(['zone', 'channel', 'keyword_rule', 'allowed_domain']),
  payload: z.record(z.unknown()),
});

// MOD-3 & F16: Two-person unmask request / approval
export const unmaskRequestSchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('request'),
      postId: z.string().uuid(),
      basis: z.enum(['legal_request', 'credible_threat', 'upsa_disciplinary_referral']),
      reference: z.string().trim().min(3).max(200),
      reason: z.string().trim().min(10).max(500),
      actorUserId: z.string().uuid().optional(),
    }),
    z.object({
      action: z.literal('approve'),
      requestId: z.number().int().positive(),
      requestedByUserId: z.string().uuid().optional(),
      actorUserId: z.string().uuid().optional(),
    }),
    z.object({
      action: z.literal('reject'),
      requestId: z.number().int().positive(),
      reason: z.string().trim().min(5).max(500),
      actorUserId: z.string().uuid().optional(),
    }),
  ])
  .refine(
    (data) => {
      if (
        data.action === 'approve' &&
        data.requestedByUserId &&
        data.actorUserId &&
        data.requestedByUserId === data.actorUserId
      ) {
        return false;
      }
      return true;
    },
    {
      message: 'The same person cannot both request and approve an unmask (two-person rule).',
      path: ['actorUserId'],
    }
  );

