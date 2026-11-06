import { NextResponse } from 'next/server';
import { apiSuccess, clearSessionCookie } from '@/lib/api-helpers';

export async function POST() {
  const res = apiSuccess({ loggedOut: true });
  return clearSessionCookie(res);
}

