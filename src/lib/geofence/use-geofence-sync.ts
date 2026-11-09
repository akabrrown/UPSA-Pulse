'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type GeofenceState =
  | 'idle'
  | 'locating'
  | 'verified'
  | 'outside'
  | 'weak_signal'
  | 'denied'
  | 'unavailable'
  | 'unsupported'
  | 'auth_required'
  | 'error';

export interface GeofenceStatus {
  state: GeofenceState;
  zoneId?: number;
  zoneName?: string;
  verifiedUntil?: number;
  message?: string;
  checkedAt?: number;
}

interface WorkerStatusMessage {
  type: 'GEOFENCE_STATUS';
  state: GeofenceState;
  zoneId?: number;
  zoneName?: string;
  verifiedUntil?: number;
  message?: string;
  at: number;
}

interface UseGeofenceSyncOptions {
  enabled: boolean;
  onVerified?: (status: GeofenceStatus) => void;
}

const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 };
const ONE_SHOT_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };

export function useGeofenceSync({ enabled, onVerified }: UseGeofenceSyncOptions) {
  const [status, setStatus] = useState<GeofenceStatus>({ state: 'idle' });
  const workerRef = useRef<Worker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const stateRef = useRef<GeofenceState>('idle');
  const onVerifiedRef = useRef(onVerified);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  const sendPosition = useCallback((pos: GeolocationPosition) => {
    workerRef.current?.postMessage({
      type: 'POSITION',
      payload: {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      },
    });
  }, []);

  const sendPositionError = useCallback((err: GeolocationPositionError) => {
    workerRef.current?.postMessage({ type: 'POSITION_ERROR', payload: { code: err.code } });
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const startWatch = useCallback(() => {
    if (watchIdRef.current !== null || typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(sendPosition, sendPositionError, WATCH_OPTIONS);
  }, [sendPosition, sendPositionError]);

  const requestOneShot = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(sendPosition, sendPositionError, ONE_SHOT_OPTIONS);
  }, [sendPosition, sendPositionError]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || typeof Worker === 'undefined' || !('geolocation' in navigator)) {
      stateRef.current = 'unsupported';
      setStatus({
        state: 'unsupported',
        message: 'This browser cannot share a location, so campus verification is unavailable.',
      });
      return;
    }

    const worker = new Worker('/geofence-worker.js');
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerStatusMessage | { type: 'NEED_POSITION' }>) => {
      const data = event.data;
      if (data.type === 'NEED_POSITION') {
        requestOneShot();
        return;
      }
      if (data.type !== 'GEOFENCE_STATUS') return;

      const previous = stateRef.current;
      stateRef.current = data.state;
      const next: GeofenceStatus = {
        state: data.state,
        zoneId: data.zoneId,
        zoneName: data.zoneName,
        verifiedUntil: data.verifiedUntil,
        message: data.message,
        checkedAt: data.at,
      };
      setStatus(next);

      if (data.state === 'verified') {
        stopWatch();
        if (previous !== 'verified') onVerifiedRef.current?.(next);
      } else if (data.state !== 'auth_required' && !document.hidden) {
        startWatch();
      }
    };

    worker.postMessage({ type: 'START' });
    startWatch();

    const handleVisibility = () => {
      if (document.hidden) {
        stopWatch();
        return;
      }
      worker.postMessage({ type: 'CHECK_NOW' });
      if (stateRef.current !== 'verified') startWatch();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let permission: PermissionStatus | null = null;
    const handlePermissionChange = () => {
      if (permission?.state === 'granted') {
        worker.postMessage({ type: 'CHECK_NOW' });
        startWatch();
      }
    };
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        permission = p;
        p.addEventListener('change', handlePermissionChange);
      })
      .catch(() => {
        permission = null;
      });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      permission?.removeEventListener('change', handlePermissionChange);
      stopWatch();
      worker.postMessage({ type: 'STOP' });
      worker.terminate();
      workerRef.current = null;
      stateRef.current = 'idle';
    };
  }, [enabled, requestOneShot, startWatch, stopWatch]);

  const checkNow = useCallback(() => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'CHECK_NOW' });
    startWatch();
  }, [startWatch]);

  const injectPosition = useCallback(
    (coords: { lat: number; lng: number; accuracy: number }) => {
      if (process.env.NODE_ENV === 'production') return;
      stopWatch();
      workerRef.current?.postMessage({ type: 'POSITION', payload: coords });
    },
    [stopWatch]
  );

  return { status, checkNow, injectPosition };
}
