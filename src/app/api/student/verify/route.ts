import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env';
import { verifyStudentIndexWithApiKey } from '@/lib/domain/pulse-engine';
import { apiError, apiSuccess, mapDomainErrorToResponse } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId =
      searchParams.get('student_id') ||
      searchParams.get('indexNumber') ||
      searchParams.get('index_number') ||
      '';
    const surname =
      searchParams.get('surname') ||
      searchParams.get('last_name') ||
      undefined;

    const wantsText =
      searchParams.get('format') === 'text' ||
      req.headers.get('accept')?.includes('text/plain') ||
      Boolean(searchParams.get('r'));

    if (!studentId.trim()) {
      if (wantsText) {
        return new NextResponse('Please Check your Student ID', {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      return apiError(
        'empty_student_id',
        'Enter your UPSA student ID or index number (e.g. 10298545).',
        400
      );
    }

    const env = getServerEnv();
    const check = await verifyStudentIndexWithApiKey(
      studentId.trim(),
      env.UPSA_INDEX_VERIFICATION_API_KEY,
      env.UPSA_INDEX_VERIFICATION_API_URL,
      env.UPSA_INDEX_VERIFICATION_PROXY_URL,
      surname
    );

    if (wantsText) {
      if (check.valid && check.studentName) {
        return new NextResponse(check.studentName, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      return new NextResponse('Please Check your Student ID', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (!check.valid) {
      return apiSuccess({
        valid: false,
        reason: check.reason ?? 'invalid_index_number',
        message:
          check.reason === 'invalid_index_format'
            ? 'Invalid UPSA student ID format. UPSA student IDs are 8 digits starting with 10 (e.g. 10298545).'
            : 'UPSA student index number not found on university records. Please check your student ID and try again.',
      });
    }

    return apiSuccess(check);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const studentId =
      typeof body.student_id === 'string'
        ? body.student_id.trim()
        : typeof body.indexNumber === 'string'
          ? body.indexNumber.trim()
          : typeof body.index_number === 'string'
            ? body.index_number.trim()
            : '';
    const surname =
      typeof body.surname === 'string'
        ? body.surname.trim()
        : typeof body.last_name === 'string'
          ? body.last_name.trim()
          : undefined;

    if (!studentId) {
      return apiError(
        'empty_student_id',
        'Enter your UPSA student ID or index number (e.g. 10298545).',
        400
      );
    }

    const env = getServerEnv();
    const check = await verifyStudentIndexWithApiKey(
      studentId,
      env.UPSA_INDEX_VERIFICATION_API_KEY,
      env.UPSA_INDEX_VERIFICATION_API_URL,
      env.UPSA_INDEX_VERIFICATION_PROXY_URL,
      surname
    );

    const wantsText =
      body.format === 'text' || req.headers.get('accept')?.includes('text/plain');

    if (wantsText) {
      if (check.valid && check.studentName) {
        return new NextResponse(check.studentName, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      return new NextResponse('Please Check your Student ID', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (!check.valid) {
      return apiSuccess({
        valid: false,
        reason: check.reason ?? 'invalid_index_number',
        message:
          check.reason === 'invalid_index_format'
            ? 'Invalid UPSA student ID format. UPSA student IDs are 8 digits starting with 10 (e.g. 10298545).'
            : 'UPSA student index number not found on university records. Please check your student ID and try again.',
      });
    }

    return apiSuccess(check);
  } catch (err) {
    return mapDomainErrorToResponse(err);
  }
}

