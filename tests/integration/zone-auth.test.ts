import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as verifyZonePost } from '@/app/api/zone/verify/route';
import { signSessionToken, verifySessionToken } from '@/lib/domain/pulse-engine';

const SECRET = 'unit-test-secret-at-least-16-chars';
const USER = '11111111-1111-4111-8111-111111111111';

describe('zone verification requires a real session', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects an anonymous caller with 401 instead of acting as a demo user', async () => {
    const res = await verifyZonePost(
      new NextRequest('http://localhost:3000/api/zone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 5.6612, lng: -0.1661, accuracy: 20 }),
      })
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('auth_required');
  });

  it('accepts signed session tokens', () => {
    expect(verifySessionToken(signSessionToken(USER, SECRET), SECRET)).toBe(USER);
  });

  it('rejects a raw user id as a session outside the test runner', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    expect(verifySessionToken(USER, SECRET)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = signSessionToken(USER, SECRET);
    expect(verifySessionToken(`${token}x`, SECRET)).toBeNull();
    expect(verifySessionToken(token, 'a-different-secret-value-123'))
      .toBeNull();
  });
});

