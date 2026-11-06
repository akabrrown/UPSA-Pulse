// public/feed-worker.js
// UPSA Pulse Background Feed Synchronization Worker
// Runs in background thread to poll and stream fresh campus feeds without page reloads.

let pollIntervalMs = 10000;
let timerId = null;
let currentConfig = {
  sort: 'hot',
  zoneId: null,
  channelId: null,
  asksOnly: false,
};
let isRunning = false;
let lastPostIds = [];

async function fetchFeed() {
  try {
    const params = new URLSearchParams();
    if (currentConfig.sort) params.set('sort', currentConfig.sort);
    if (currentConfig.zoneId !== null && currentConfig.zoneId !== undefined) {
      params.set('zoneId', String(currentConfig.zoneId));
    }
    if (currentConfig.channelId !== null && currentConfig.channelId !== undefined) {
      params.set('channelId', String(currentConfig.channelId));
    }
    if (currentConfig.asksOnly) {
      params.set('kind', 'ask');
    }

    const response = await fetch(`/api/feed?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'x-pulse-worker': '1',
      },
    });

    if (!response.ok) {
      self.postMessage({
        type: 'FEED_SYNC_ERROR',
        status: response.status,
        timestamp: Date.now(),
      });
      return;
    }

    const json = await response.json();
    const newPosts = Array.isArray(json.data?.items)
      ? json.data.items
      : Array.isArray(json.data?.posts)
        ? json.data.posts
        : [];
    if (!newPosts.length && !lastPostIds.length) return;
    const newIds = newPosts.map((p) => p.id);

    let freshCount = 0;
    if (lastPostIds.length > 0) {
      for (const id of newIds) {
        if (!lastPostIds.includes(id)) {
          freshCount++;
        }
      }
    }

    lastPostIds = newIds;

    self.postMessage({
      type: 'FEED_SYNC_SUCCESS',
      posts: newPosts,
      freshCount,
      timestamp: Date.now(),
    });
  } catch (err) {
    self.postMessage({
      type: 'FEED_SYNC_ERROR',
      error: err instanceof Error ? err.message : 'Background sync failure',
      timestamp: Date.now(),
    });
  }
}

function scheduleNext() {
  if (!isRunning) return;
  if (timerId) clearTimeout(timerId);
  timerId = setTimeout(async () => {
    await fetchFeed();
    scheduleNext();
  }, pollIntervalMs);
}

self.onmessage = function (e) {
  const { type, payload } = e.data || {};
  switch (type) {
    case 'START':
      isRunning = true;
      if (payload) {
        currentConfig = { ...currentConfig, ...payload };
      }
      void fetchFeed();
      scheduleNext();
      break;

    case 'UPDATE_CONFIG':
      if (payload) {
        currentConfig = { ...currentConfig, ...payload };
      }
      lastPostIds = [];
      void fetchFeed();
      scheduleNext();
      break;

    case 'FETCH_NOW':
      void fetchFeed();
      break;

    case 'SET_INTERVAL':
      if (typeof payload?.intervalMs === 'number' && payload.intervalMs >= 3000) {
        pollIntervalMs = payload.intervalMs;
      }
      break;

    case 'STOP':
      isRunning = false;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      break;
  }
};
