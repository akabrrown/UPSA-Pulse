import { NextRequest } from 'next/server';
import { otpVerifySchema, signUpConsentSchema } from '@/lib/validation/schemas';
import { isAllowedEmailDomain } from '@/lib/domain/pulse-engine';
import { registerSignUpAndDeviceInStore } from '@/lib/store/pulse-store';
import { getServerEnv } from '@/lib/env';
import { apiError, apiSuccess, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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

    const env = getServerEnv();
    const registration = registerSignUpAndDeviceInStore({
      email: verifyParsed.data.email,
      rawDeviceToken: verifyParsed.data.deviceToken ?? 'default-browser-device-token',
      pepper: env.DEVICE_HASH_PEPPER,
    });

    return apiSuccess(registration);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

