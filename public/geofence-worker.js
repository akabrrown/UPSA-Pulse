'use strict';

// Campus geofence background worker.
// Browsers do not expose geolocation inside workers, so the page forwards position
// fixes here. This worker owns scheduling and the network: it verifies the zone,
// renews the 15-minute pass before it lapses, and retries on its own with backoff
// until the student is inside a zone. Coordinates are never echoed back or stored.

var TICK_MS = 5000;
var RENEW_BEFORE_MS = 4 * 60 * 1000;
var FIX_MAX_AGE_MS = 90 * 1000;
var BASE_RETRY_MS = 10 * 1000;
var MAX_RETRY_MS = 120 * 1000;
var UNVERIFIED_REFRESH_MS = 60 * 1000;

var timer = null;
var stopped = true;
var inFlight = false;
var fix = null;
var verifiedUntil = 0;
var lastAttemptAt = 0;
var lastAttemptFixAt = 0;
var retryDelay = BASE_RETRY_MS;

function emit(state, extra) {
  var msg = { type: 'GEOFENCE_STATUS', state: state, at: Date.now() };
  if (extra) {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) msg[key] = extra[key];
    }
  }
  self.postMessage(msg);
}

function stopWorker() {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function backoff() {
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
}

async function verify() {
  if (inFlight || !fix || stopped) return;
  inFlight = true;
  lastAttemptAt = Date.now();
  lastAttemptFixAt = fix.at;
  try {
    var res = await fetch('/api/zone/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy }),
    });
    var json = null;
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }

    if (res.ok && json && json.success && json.data) {
      var until = Date.parse(json.data.verifiedUntil);
      verifiedUntil = isNaN(until) ? Date.now() + 15 * 60 * 1000 : until;
      retryDelay = BASE_RETRY_MS;
      emit('verified', {
        zoneId: json.data.zoneId,
        zoneName: json.data.zoneName,
        verifiedUntil: verifiedUntil,
      });
      return;
    }

    verifiedUntil = 0;
    if (res.status === 401) {
      emit('auth_required', { message: 'Sign in to verify your campus location.' });
      stopWorker();
      return;
    }

    var code = json && json.error ? json.error.code : null;
    var message = json && json.error ? json.error.message : null;
    backoff();
    if (code === 'accuracy_too_low') {
      emit('weak_signal', { message: message });
    } else if (code === 'not_in_zone') {
      emit('outside', { message: message });
    } else {
      emit('error', {
        message: 'Could not check your location right now. Retrying automatically.',
        status: res.status,
      });
    }
  } catch (e) {
    verifiedUntil = 0;
    backoff();
    emit('error', { message: 'You appear to be offline. Retrying automatically.' });
  } finally {
    inFlight = false;
  }
}

function tick() {
  if (stopped) return;
  var now = Date.now();
  var passHealthy = verifiedUntil - now > RENEW_BEFORE_MS;
  if (passHealthy) return;

  if (!fix || now - fix.at > FIX_MAX_AGE_MS) {
    self.postMessage({ type: 'NEED_POSITION' });
    return;
  }

  var sinceAttempt = now - lastAttemptAt;
  if (verifiedUntil > now) {
    if (sinceAttempt >= BASE_RETRY_MS) void verify();
    return;
  }

  var hasNewerFix = fix.at > lastAttemptFixAt;
  if (sinceAttempt >= retryDelay && (hasNewerFix || sinceAttempt >= UNVERIFIED_REFRESH_MS)) {
    void verify();
  }
}

self.onmessage = function (event) {
  var data = event.data || {};
  var payload = data.payload || {};

  switch (data.type) {
    case 'START':
      stopWorker();
      stopped = false;
      fix = null;
      verifiedUntil = 0;
      lastAttemptAt = 0;
      lastAttemptFixAt = 0;
      retryDelay = BASE_RETRY_MS;
      emit('locating');
      timer = setInterval(tick, TICK_MS);
      break;

    case 'POSITION':
      if (
        stopped ||
        typeof payload.lat !== 'number' ||
        typeof payload.lng !== 'number' ||
        typeof payload.accuracy !== 'number'
      ) {
        break;
      }
      fix = { lat: payload.lat, lng: payload.lng, accuracy: payload.accuracy, at: Date.now() };
      tick();
      break;

    case 'POSITION_ERROR':
      if (stopped) break;
      if (payload.code === 1) {
        emit('denied', {
          message:
            'Location permission is blocked. Allow location access in your browser settings so Pulse can confirm you are on campus.',
        });
      } else {
        emit('unavailable', {
          message: 'Could not get a GPS fix yet. Step outside or near a window and Pulse will keep trying.',
        });
      }
      break;

    case 'CHECK_NOW':
      if (stopped) break;
      retryDelay = BASE_RETRY_MS;
      lastAttemptAt = 0;
      if (fix && Date.now() - fix.at <= FIX_MAX_AGE_MS) {
        void verify();
      } else {
        emit('locating');
        self.postMessage({ type: 'NEED_POSITION' });
      }
      break;

    case 'STOP':
      stopWorker();
      break;
  }
};

