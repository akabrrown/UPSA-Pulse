import { NextRequest } from 'next/server';
import {
  forgotPasswordRequestSchema,
  forgotPasswordResetSchema,
  googleAuthSchema,
  otpVerifySchema,
  signUpConsentSchema,
  studentLoginSchema,
  studentSignUpSchema,
} from '@/lib/validation/schemas';
import {
  checkRateLimit,
  generateRandomStudentUsername,
  isAllowedEmailDomain,
  verifyStudentIndexWithApiKey,
} from '@/lib/domain/pulse-engine';
import { registerSignUpAndDeviceInStore } from '@/lib/store/pulse-store';
import {
  dbCheckUsernameTaken,
  dbConfirmPasswordReset,
  dbGoogleAuthStudent,
  dbLoginStudent,
  dbRequestPasswordReset,
  dbSignUpStudent,
} from '@/lib/db/postgres';
import { getServerEnv } from '@/lib/env';
import { apiError, apiSuccess, attachSessionCookie, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const env = getServerEnv();
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    if (body.step === 'verify_index') {
      const rawIndex = typeof body.indexNumber === 'string' ? body.indexNumber.trim() : '';
      const surname = typeof body.surname === 'string' ? body.surname.trim() : undefined;
      if (!rawIndex) {
        return apiSuccess({
          valid: false,
          reason: 'empty_index',
          message: 'Enter your UPSA student index number first (e.g. 10284912).',
        });
      }
      const check = await verifyStudentIndexWithApiKey(
        rawIndex,
        env.UPSA_INDEX_VERIFICATION_API_KEY,
        env.UPSA_INDEX_VERIFICATION_API_URL,
        env.UPSA_INDEX_VERIFICATION_PROXY_URL,
        surname
      );
      if (!check.valid) {
        return apiSuccess({
          valid: false,
          reason: check.reason ?? 'invalid_index_number',
          maskedName: check.maskedName,
          surnameHint: check.surnameHint,
          challengeRequired: check.challengeRequired ?? false,
          message:
            check.reason === 'invalid_index_format'
              ? 'Invalid UPSA student ID format. UPSA student IDs are 8 digits starting with 10 (e.g. 10298545).'
              : check.reason === 'surname_mismatch'
                ? `Surname does not match university records for ID ${check.normalizedIndex}. Please enter your exact legal surname.`
                : 'UPSA student index number not found on university records. Please check your student ID and try again.',
        });
      }
      return apiSuccess({
        ...check,
        message: check.challengeRequired
          ? `Student ID located. Please confirm your legal surname to prove ownership.`
          : `Student ID & surname confirmed for ${check.normalizedIndex}.`,
      });
    }

    if (body.step === 'check_username') {
      const rawUser = typeof body.username === 'string' ? body.username.trim() : '';
      if (rawUser.length < 3) {
        return apiSuccess({
          available: false,
          reason: 'Username must be at least 3 characters.',
          username: rawUser,
        });
      }
      if (rawUser.length > 24) {
        return apiSuccess({
          available: false,
          reason: 'Username cannot exceed 24 characters.',
          username: rawUser,
        });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(rawUser)) {
        return apiSuccess({
          available: false,
          reason: 'Username can only contain letters, numbers, and underscores.',
          username: rawUser,
        });
      }
      const isTaken = await dbCheckUsernameTaken(rawUser);
      return apiSuccess({
        available: !isTaken,
        username: rawUser,
        reason: isTaken ? 'This username is already taken. Please choose another username.' : undefined,
      });
    }

    if (body.step === 'signup') {
      const rateLimit = checkRateLimit(`signup:${clientIp}`, 15, 900_000);
      if (!rateLimit.allowed) {
        return apiError(
          'rate_limited',
          `Too many sign-up attempts from this network. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
          429
        );
      }

      const parsed = studentSignUpSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          'invalid_signup_input',
          parsed.error.issues[0]?.message ??
            'Enter a valid username, UPSA index number, password, and accept all three legal consents.',
          400
        );
      }

      const indexCheck = await verifyStudentIndexWithApiKey(
        parsed.data.indexNumber,
        env.UPSA_INDEX_VERIFICATION_API_KEY,
        env.UPSA_INDEX_VERIFICATION_API_URL,
        env.UPSA_INDEX_VERIFICATION_PROXY_URL,
        parsed.data.surname
      );
      if (!indexCheck.valid || indexCheck.challengeRequired) {
        return apiError(
          indexCheck.reason ??
            (indexCheck.challengeRequired ? 'surname_challenge_required' : 'invalid_index_number'),
          indexCheck.reason === 'surname_mismatch'
            ? 'The surname entered does not match university records for this student ID.'
            : indexCheck.challengeRequired
              ? 'You must confirm your legal surname before creating an account with this student ID.'
              : indexCheck.reason === 'invalid_index_format'
                ? 'Invalid UPSA student ID format. UPSA student IDs are 8 digits starting with 10 (e.g. 10298545).'
                : 'UPSA student index number not found on university records. Please check your student ID and try again.',
          400
        );
      }

      const created = await dbSignUpStudent({
        username: parsed.data.username?.trim() || generateRandomStudentUsername(),
        indexNumber: indexCheck.normalizedIndex,
        password: parsed.data.password,
        email: parsed.data.email || undefined,
        rawDeviceToken: parsed.data.deviceToken ?? 'default-browser-device-token',
        pepper: env.DEVICE_HASH_PEPPER,
      });

      const res = apiSuccess(
        {
          ...created,
          verificationMode: indexCheck.verificationMode,
        },
        201
      );
      return attachSessionCookie(res, created.userId, env.DEVICE_HASH_PEPPER);
    }

    if (body.step === 'login') {
      const parsed = studentLoginSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          'invalid_login_input',
          parsed.error.issues[0]?.message ?? 'Enter your UPSA index number or username and password.',
          400
        );
      }

      const rateLimit = checkRateLimit(
        `login:${clientIp}:${parsed.data.identifier.toLowerCase()}`,
        10,
        60_000
      );
      if (!rateLimit.allowed) {
        return apiError(
          'rate_limited',
          `Too many login attempts. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
          429
        );
      }

      const session = await dbLoginStudent({
        identifier: parsed.data.identifier,
        password: parsed.data.password,
        rawDeviceToken: parsed.data.deviceToken ?? 'default-browser-device-token',
        pepper: env.DEVICE_HASH_PEPPER,
      });

      const res = apiSuccess(session);
      return attachSessionCookie(res, session.userId, env.DEVICE_HASH_PEPPER);
    }

    if (body.step === 'google') {
      const parsed = googleAuthSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          'invalid_google_input',
          parsed.error.issues[0]?.message ?? 'Enter a valid Google account and UPSA index number.',
          400
        );
      }

      let normalizedIdx: string | undefined;
      if (parsed.data.indexNumber) {
        const indexCheck = await verifyStudentIndexWithApiKey(
          parsed.data.indexNumber,
          env.UPSA_INDEX_VERIFICATION_API_KEY,
          env.UPSA_INDEX_VERIFICATION_API_URL,
          env.UPSA_INDEX_VERIFICATION_PROXY_URL
        );
        if (!indexCheck.valid) {
          return apiError(
            indexCheck.reason ?? 'invalid_index_number',
            'Invalid UPSA student index number.',
            400
          );
        }
        normalizedIdx = indexCheck.normalizedIndex;
      }

      const session = await dbGoogleAuthStudent({
        googleEmail: parsed.data.googleEmail,
        username: parsed.data.username,
        indexNumber: normalizedIdx,
        rawDeviceToken: parsed.data.deviceToken ?? 'default-browser-device-token',
        pepper: env.DEVICE_HASH_PEPPER,
      });

      const res = apiSuccess(session);
      return attachSessionCookie(res, session.userId, env.DEVICE_HASH_PEPPER);
    }

    if (body.step === 'forgot_password_request') {
      const parsed = forgotPasswordRequestSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          'invalid_identifier',
          parsed.error.issues[0]?.message ?? 'Enter your UPSA index number or username.',
          400
        );
      }

      const rateLimit = checkRateLimit(
        `forgot_req:${clientIp}:${parsed.data.identifier.toLowerCase()}`,
        5,
        900_000
      );
      if (!rateLimit.allowed) {
        return apiError(
          'rate_limited',
          `Too many recovery requests for this account. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
          429
        );
      }

      const resetReq = await dbRequestPasswordReset({
        identifier: parsed.data.identifier,
        pepper: env.DEVICE_HASH_PEPPER,
      });

      return apiSuccess(resetReq);
    }

    if (body.step === 'forgot_password_reset') {
      const parsed = forgotPasswordResetSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          'invalid_reset_input',
          parsed.error.issues[0]?.message ??
            'Enter your UPSA index number/username, 6-digit recovery code, and a new password.',
          400
        );
      }

      const rateLimit = checkRateLimit(
        `forgot_reset:${clientIp}:${parsed.data.identifier.toLowerCase()}`,
        5,
        900_000
      );
      if (!rateLimit.allowed) {
        return apiError(
          'rate_limited',
          `Too many recovery attempts. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
          429
        );
      }

      const resetResult = await dbConfirmPasswordReset({
        identifier: parsed.data.identifier,
        resetCode: parsed.data.resetCode,
        newPassword: parsed.data.newPassword,
        pepper: env.DEVICE_HASH_PEPPER,
      });

      return apiSuccess({
        ...resetResult,
        passwordUpdated: true,
      });
    }

    if (body.step === 'request_otp') {
      const parsed = signUpConsentSchema.safeParse(body);
      if (!parsed.success) {
        return apiError(
          'consent_required',
          parsed.error.issues[0]?.message ??
            'You must confirm you are 18+ and accept all three legal documents.',
          400
        );
      }

      if (!isAllowedEmailDomain(parsed.data.email)) {
        return apiError(
          'domain_not_allowed',
          'Only allow-listed UPSA email addresses (@upsa.edu.gh, @st.upsa.edu.gh) are accepted.',
          403
        );
      }

      return apiSuccess({
        otpSent: true,
        email: parsed.data.email.trim().toLowerCase(),
      });
    }

    const verifyParsed = otpVerifySchema.safeParse(body);
    if (!verifyParsed.success) {
      return apiError('invalid_otp', 'Enter a valid 6-digit verification code.', 400);
    }

    const registration = registerSignUpAndDeviceInStore({
      email: verifyParsed.data.email,
      rawDeviceToken: verifyParsed.data.deviceToken ?? 'default-browser-device-token',
      pepper: env.DEVICE_HASH_PEPPER,
    });

    const res = apiSuccess(registration);
    return attachSessionCookie(res, registration.userId, env.DEVICE_HASH_PEPPER);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

