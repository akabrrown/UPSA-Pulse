import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Posted = { type: string; state?: string; [key: string]: unknown };

const workerSource = fs.readFileSync(path.join(process.cwd(), 'public', 'geofence-worker.js'), 'utf8');

function fetchResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const verifiedBody = (until: number) =>
  fetchResponse(200, {
    success: true,
    data: { verified: true, zoneId: 1, zoneName: 'UPSA Main Campus', verifiedUntil: new Date(until).toISOString() },
  });

const rejection = (status: number, code: string, message: string) =>
  fetchResponse(status, { success: false, data: null, error: { code, message } });

function bootWorker() {
  const posted: Posted[] = [];
  const fetchMock = vi.fn();
  const scope: { postMessage: (m: Posted) => void; onmessage: ((e: { data: unknown }) => void) | null } = {
    postMessage: (m) => posted.push(m),
    onmessage: null,
  };
  new Function('self', 'fetch', 'setInterval', 'clearInterval', 'Date', workerSource)(
    scope,
    fetchMock,
    setInterval,
    clearInterval,
    Date
  );
  const send = (type: string, payload?: unknown) => scope.onmessage?.({ data: { type, payload } });
  const states = () => posted.filter((m) => m.type === 'GEOFENCE_STATUS').map((m) => m.state);
  return { posted, fetchMock, send, states };
}

const insideCampus = { lat: 5.6612, lng: -0.1661, accuracy: 20 };

describe('Campus geofence background worker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T08:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifies as soon as the first position arrives and reports the zone without coordinates', async () => {
    const w = bootWorker();
    w.fetchMock.mockResolvedValue(verifiedBody(Date.now() + 15 * 60 * 1000));
    w.send('START');
    w.send('POSITION', insideCampus);
    await vi.advanceTimersByTimeAsync(0);

    expect(w.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = w.fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/zone/verify');
    expect(JSON.parse(init.body)).toEqual(insideCampus);
    expect(w.states()).toEqual(['locating', 'verified']);

    const verified = w.posted.find((m) => m.state === 'verified')!;
    expect(verified.zoneName).toBe('UPSA Main Campus');
    expect(JSON.stringify(w.posted)).not.toContain('5.6612');
  });

  it('keeps retrying with backoff while outside and recovers on its own once inside', async () => {
    const w = bootWorker();
    w.fetchMock
      .mockResolvedValueOnce(rejection(403, 'not_in_zone', 'Move closer and try again.'))
      .mockResolvedValue(verifiedBody(Date.now() + 15 * 60 * 1000));
    w.send('START');
    w.send('POSITION', { lat: 5.6, lng: -0.2, accuracy: 20 });
    await vi.advanceTimersByTimeAsync(0);
    expect(w.states().at(-1)).toBe('outside');

    await vi.advanceTimersByTimeAsync(1_000);
    w.send('POSITION', insideCampus);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(25_000);
    expect(w.fetchMock).toHaveBeenCalledTimes(2);
    expect(w.states().at(-1)).toBe('verified');
  });

  it('reports weak GPS signal separately from being outside the campus', async () => {
    const w = bootWorker();
    w.fetchMock.mockResolvedValue(rejection(403, 'accuracy_too_low', 'Signal too weak.'));
    w.send('START');
    w.send('POSITION', { ...insideCampus, accuracy: 400 });
    await vi.advanceTimersByTimeAsync(0);
    expect(w.states().at(-1)).toBe('weak_signal');
  });

  it('stops for good when the session is not authenticated', async () => {
    const w = bootWorker();
    w.fetchMock.mockResolvedValue(rejection(401, 'auth_required', 'Sign in.'));
    w.send('START');
    w.send('POSITION', insideCampus);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.states().at(-1)).toBe('auth_required');

    w.send('POSITION', insideCampus);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(w.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not call the server while the pass is healthy, then asks for a fresh fix and renews before expiry', async () => {
    const w = bootWorker();
    w.fetchMock.mockImplementation(async () => verifiedBody(Date.now() + 15 * 60 * 1000));
    w.send('START');
    w.send('POSITION', insideCampus);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(8 * 60 * 1000);
    expect(w.fetchMock).toHaveBeenCalledTimes(1);
    expect(w.posted.filter((m) => m.type === 'NEED_POSITION')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(w.posted.some((m) => m.type === 'NEED_POSITION')).toBe(true);

    w.send('POSITION', insideCampus);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps permission and GPS errors from the page to user-facing states', async () => {
    const w = bootWorker();
    w.send('START');
    w.send('POSITION_ERROR', { code: 1 });
    w.send('POSITION_ERROR', { code: 2 });
    expect(w.states()).toEqual(['locating', 'denied', 'unavailable']);
  });

  it('ignores malformed positions and stops cleanly', async () => {
    const w = bootWorker();
    w.send('START');
    w.send('POSITION', { lat: 'x', lng: null, accuracy: 5 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.fetchMock).not.toHaveBeenCalled();

    w.send('STOP');
    w.send('POSITION', insideCampus);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.fetchMock).not.toHaveBeenCalled();
  });
});

