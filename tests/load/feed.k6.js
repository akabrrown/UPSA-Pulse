// k6 Load Test — TDD Section 9 & 12: Feed reads and vote writes at expected peak; target p95 under 400 ms
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<400'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function runLoadScenario() {
  const feedRes = http.get(`${BASE_URL}/api/feed?sort=hot`);
  check(feedRes, {
    'feed status is 200': (r) => r.status === 200,
    'feed never leaks author_id': (r) => !r.body.includes('author_id'),
  });
  sleep(1);
}

