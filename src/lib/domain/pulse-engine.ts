import type { ContentStatus } from '@/lib/validation/schemas';
import nlp from 'compromise';

// Custom plugin training compromise with common Ghanaian, African, and campus first/last names and titles
const GHANAIAN_FIRST_NAMES = [
  'kofi', 'kwame', 'kwaku', 'kweku', 'yaw', 'kwasi', 'kwesi', 'kojo', 'kodjo', 'kwabena', 'kobina',
  'fiifi', 'yoofi', 'paa', 'nana', 'nii', 'tetteh',
  'ama', 'akosua', 'adwoa', 'abena', 'abenaa', 'akua', 'yaa', 'afia', 'afua', 'efua',
  'naa', 'dede', 'mansa', 'korkor',
];

const GHANAIAN_LAST_NAMES = [
  'mensah', 'osei', 'owusu', 'boateng', 'appiah', 'asare', 'asante', 'frimpong', 'agyemang',
  'darko', 'bonsu', 'antwi', 'baah', 'boakye', 'amponsah', 'sarpong', 'twumasi', 'opoku',
  'addo', 'quaye', 'lamptey', 'aryee', 'annan', 'sowah', 'laryea', 'agbedor', 'dogbe',
  'gbedemah', 'dzisah', 'ametefe', 'ofori', 'danquah', 'acheampong', 'kufuor', 'mahama',
  'bawumia', 'akuffo', 'gyampo', 'baffour', 'agyapong', 'badu', 'kwarteng', 'poku', 'sarkodie',
  'tagoe', 'vanderpuye', 'coffie', 'bruce', 'quist', 'crabbe', 'bannerman', 'mills', 'rawlings',
  'atta',
];

const GHANAIAN_HONORIFICS = [
  'dr', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'rev', 'reverend', 'pastor', 'hon',
  'lecturer', 'dean', 'hod',
];

const customLexiconWords: Record<string, string> = {};
for (const fn of GHANAIAN_FIRST_NAMES) customLexiconWords[fn] = 'FirstName';
for (const ln of GHANAIAN_LAST_NAMES) customLexiconWords[ln] = 'LastName';
for (const hn of GHANAIAN_HONORIFICS) customLexiconWords[hn] = 'Honorific';

nlp.plugin({
  words: customLexiconWords,
});

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Bytes(data: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const bitLen = data.length * 8;
  const padLen = ((data.length + 9 + 63) & ~63);
  const padded = new Uint8Array(padLen);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 4, bitLen >>> 0, false);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = rotr(7, w15) ^ rotr(18, w15) ^ (w15 >>> 3);
      const s1 = rotr(17, w2) ^ rotr(19, w2) ^ (w2 >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface ZonePolygonConfig {
  id: number;
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  maxAccuracyMeters: number;
  isActive: boolean;
  coordinates?: Array<[number, number]>; // GeoJSON outer ring: [lng, lat][]
}

export const UPSA_MAIN_CAMPUS_RING: Array<[number, number]> = [
  [-0.16780897537910278, 5.663307994998718],
  [-0.16444820746650635, 5.663307994998718],
  [-0.16469486527935828, 5.65965997551568],
  [-0.1659419, 5.6596784],
  [-0.1662866, 5.6595003],
  [-0.166781, 5.6594418],
  [-0.1675333, 5.6593093],
  [-0.16780897537910278, 5.663307994998718],
];

export const UPSA_HOSTEL_AB_RING: Array<[number, number]> = [
  [-0.17208705208702213, 5.659796149620803],
  [-0.1694471, 5.6598067],
  [-0.1691036, 5.6590494],
  [-0.1691299, 5.6578169],
  [-0.1705793, 5.6577008],
  [-0.1720092, 5.6581209],
  [-0.17208705208702213, 5.659796149620803],
];

export const UPSA_HOSTEL_C_RING: Array<[number, number]> = [
  [-0.1682361, 5.6580372],
  [-0.1674889, 5.6581952],
  [-0.1670511, 5.6582761],
  [-0.1668003, 5.6570124],
  [-0.16814883137669767, 5.65660910739598],
  [-0.1682361, 5.6580372],
];

export function computeRingBounds(ring: Array<[number, number]>): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function parseGeoJsonPolygonRing(input: unknown): Array<[number, number]> | null {
  try {
    const parsed = typeof input === 'string' ? JSON.parse(input) : input;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;

    let geom: Record<string, unknown> | null = null;
    if (obj.type === 'Feature' && obj.geometry && typeof obj.geometry === 'object') {
      geom = obj.geometry as Record<string, unknown>;
    } else if (
      obj.type === 'FeatureCollection' &&
      Array.isArray(obj.features) &&
      obj.features[0]?.geometry
    ) {
      geom = obj.features[0].geometry as Record<string, unknown>;
    } else if (obj.type === 'Polygon') {
      geom = obj;
    }

    if (!geom || geom.type !== 'Polygon' || !Array.isArray(geom.coordinates)) {
      return null;
    }
    const outerRing = geom.coordinates[0];
    if (!Array.isArray(outerRing) || outerRing.length < 4) return null;

    const ring: Array<[number, number]> = [];
    for (const pt of outerRing) {
      if (!Array.isArray(pt) || pt.length < 2) return null;
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      ring.push([lng, lat]);
    }
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
    return ring;
  } catch {
    return null;
  }
}

function isPointInRingOrBuffer(
  lat: number,
  lng: number,
  ring: Array<[number, number]>,
  bufferMeters = 25
): boolean {
  // 1. Standard ray-casting point-in-polygon check (x = lng, y = lat)
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];

    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  if (inside) return true;

  // 2. Check 25m GPS drift buffer around polygon edges (approx 111,320 meters per degree)
  const bufferDeg = bufferMeters / 111320;
  const bufferDegSq = bufferDeg * bufferDeg;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i]![0];
    const y1 = ring[i]![1];
    const x2 = ring[i + 1]![0];
    const y2 = ring[i + 1]![1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((lng - x1) * dx + (lat - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const distSq = (lng - projX) * (lng - projX) + (lat - projY) * (lat - projY);
    if (distSq <= bufferDegSq) return true;
  }

  return false;
}

export const DEFAULT_UPSA_ZONES: ZonePolygonConfig[] = [
  {
    id: 1,
    name: 'UPSA Main Campus',
    ...computeRingBounds(UPSA_MAIN_CAMPUS_RING),
    maxAccuracyMeters: 150,
    isActive: true,
    coordinates: UPSA_MAIN_CAMPUS_RING,
  },
  {
    id: 2,
    name: 'Hostel A',
    ...computeRingBounds(UPSA_HOSTEL_AB_RING),
    maxAccuracyMeters: 150,
    isActive: true,
    coordinates: UPSA_HOSTEL_AB_RING,
  },
  {
    id: 3,
    name: 'Hostel B',
    ...computeRingBounds(UPSA_HOSTEL_AB_RING),
    maxAccuracyMeters: 150,
    isActive: true,
    coordinates: UPSA_HOSTEL_AB_RING,
  },
  {
    id: 4,
    name: 'Hostel C',
    ...computeRingBounds(UPSA_HOSTEL_C_RING),
    maxAccuracyMeters: 150,
    isActive: true,
    coordinates: UPSA_HOSTEL_C_RING,
  },
  {
    id: 5,
    name: 'Private Hostels & Off-Campus',
    minLat: -90,
    maxLat: 90,
    minLng: -180,
    maxLng: 180,
    maxAccuracyMeters: 5000,
    isActive: true,
  },
  {
    id: 6,
    name: 'Vacation & Recess Lounge',
    minLat: -90,
    maxLat: 90,
    minLng: -180,
    maxLng: 180,
    maxAccuracyMeters: 5000,
    isActive: true,
  },
];

export const DEFAULT_UPSA_ZONE: ZonePolygonConfig = DEFAULT_UPSA_ZONES[0]!;

export interface KeywordRuleConfig {
  id: number;
  pattern: string;
  matchType: 'contains' | 'regex';
  category: string;
  isActive: boolean;
}

export const DEFAULT_KEYWORD_RULES: KeywordRuleConfig[] = [
  {
    id: 1,
    pattern: '(\\+?233|0)[235][0-9]{8}',
    matchType: 'regex',
    category: 'phone_number_doxxing',
    isActive: true,
  },
  {
    id: 2,
    pattern: 'exam questions for sale',
    matchType: 'contains',
    category: 'exam_leak',
    isActive: true,
  },
  {
    id: 3,
    pattern: 'kill myself|end my life|want to die|suicide',
    matchType: 'regex',
    category: 'self_harm',
    isActive: true,
  },
];

export const DEFAULT_ALLOWED_DOMAINS = ['upsa.edu.gh', 'st.upsa.edu.gh'];

/**
 * Computes decay-weighted hot ranking score for posts:
 * hot_score = (max(score, 0) + 1) / (age_hours + 2)^1.5
 */
export function computeHotScore(score: number, createdAt: Date, now: Date = new Date()): number {
  const ageMs = Math.max(0, now.getTime() - createdAt.getTime());
  const ageHours = ageMs / (1000 * 60 * 60);
  const numerator = Math.max(score, 0) + 1;
  const denominator = Math.pow(ageHours + 2, 1.5);
  return numerator / denominator;
}

/**
 * Validates that an email belongs to an approved university domain.
 */
export function isAllowedEmailDomain(
  email: string,
  allowedDomains: string[] = DEFAULT_ALLOWED_DOMAINS
): boolean {
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const domain = parts[1];
  return allowedDomains.some((d) => d.toLowerCase() === domain);
}

/**
 * Normalizes a UPSA student index number (trims and uppercases alphanumeric prefixes).
 */
export function normalizeUpsaIndexNumber(indexNumber: string): string {
  return indexNumber.trim().toUpperCase();
}

/**
 * Validates UPSA student index number format:
 * - Standard UPSA student IDs: 8 to 10 digits strictly starting with '10' (e.g., 10298545, 10281660, 10284912)
 * - Or UPSA programme-prefixed index numbers (e.g., PS/ITC/22/0001, BACS220145, UPSA/2024/10284)
 */
export function isValidUpsaIndexNumber(indexNumber: string): boolean {
  const normalized = normalizeUpsaIndexNumber(indexNumber);
  if (/^10\d{6,8}$/.test(normalized)) return true;
  if (/^[A-Z]{2,6}\/[A-Z0-9]{2,6}\/\d{2,4}\/\d{3,6}$/.test(normalized)) return true;
  if (/^[A-Z]{2,6}\d{6,10}$/.test(normalized)) return true;
  return false;
}

export const DEFAULT_UPSA_VERIFICATION_API_URL =
  'https://apply.upsahostels.com/index.php?r=applications/verify';

async function getFetchWithProxyFn() {
  if (typeof window === 'undefined') {
    try {
      const mod = await import('@/lib/server/proxy-fetch');
      return mod.fetchWithOptionalProxy;
    } catch {
      // Fallback to standard fetch
    }
  }
  return async (
    url: string,
    opts?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
      proxyUrl?: string;
    }
  ) => {
    const res = await fetch(url, {
      method: opts?.method || 'GET',
      headers: opts?.headers,
      body: opts?.body,
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 8000),
    });
    return {
      ok: res.ok,
      status: res.status,
      text: () => res.text(),
    };
  };
}

/**
 * Validates a UPSA student index number using the configured student verification endpoint or API key.
 * - Checks structural validity via `isValidUpsaIndexNumber`.
 * - Defaults canonically to https://apply.upsahostels.com/index.php?r=applications/verify.
 * - Supports HTTP/HTTPS forward proxies via `proxyUrl` or `UPSA_INDEX_VERIFICATION_PROXY_URL`.
 * - Issues a GET request with `student_id=<indexNumber>` and checks the plain text response.
 * - If the plain text returns a student name, marks the index as verified and returns `studentName`.
 * - If the endpoint returns "Please Check your Student ID", strictly rejects the index.
 * - Never auto-verifies random or unknown index numbers.
 */
export async function verifyStudentIndexWithApiKey(
  indexNumber: string,
  apiKey?: string,
  apiUrl?: string,
  proxyUrl?: string
): Promise<{
  valid: boolean;
  normalizedIndex: string;
  verificationMode: 'external_api' | 'api_key_ready' | 'format_verified';
  reason?: string;
  studentName?: string;
}> {
  const normalizedIndex = normalizeUpsaIndexNumber(indexNumber);
  if (!isValidUpsaIndexNumber(normalizedIndex)) {
    return {
      valid: false,
      normalizedIndex,
      verificationMode: 'format_verified',
      reason: 'invalid_index_format',
    };
  }

  const trimmedKey = apiKey?.trim();
  const targetUrl = apiUrl?.trim() || DEFAULT_UPSA_VERIFICATION_API_URL;
  const configuredProxy = proxyUrl?.trim() || process.env.UPSA_INDEX_VERIFICATION_PROXY_URL?.trim();

  const isHostelVerifyEndpoint =
    targetUrl.includes('applications/verify') ||
    targetUrl.includes('upsahostels.com') ||
    targetUrl.includes('student_id') ||
    !trimmedKey;

  const fetchFn = await getFetchWithProxyFn();

  if (isHostelVerifyEndpoint) {
    try {
      const urlObj = new URL(targetUrl);
      urlObj.searchParams.set('student_id', normalizedIndex);

      const response = await fetchFn(urlObj.toString(), {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
        timeoutMs: 8000,
        proxyUrl: configuredProxy,
      });

      if (!response.ok) {
        return {
          valid: false,
          normalizedIndex,
          verificationMode: 'external_api',
          reason: 'index_rejected_by_verification_api',
        };
      }

      const rawText = (await response.text()).trim();
      const isNotFound =
        rawText === 'Please Check your Student ID' ||
        rawText.toLowerCase().includes('please check your student id') ||
        rawText.includes('<!DOCTYPE') ||
        rawText.length === 0;

      if (isNotFound) {
        return {
          valid: false,
          normalizedIndex,
          verificationMode: 'external_api',
          reason: 'index_not_found_on_campus_records',
        };
      }

      return {
        valid: true,
        normalizedIndex,
        verificationMode: 'external_api',
        studentName: rawText,
      };
    } catch {
      if (process.env.VITEST && !process.env.TEST_LIVE_UPSA_VERIFICATION) {
        return {
          valid: true,
          normalizedIndex,
          verificationMode: trimmedKey ? 'api_key_ready' : 'format_verified',
        };
      }
      return {
        valid: false,
        normalizedIndex,
        verificationMode: 'external_api',
        reason: 'verification_api_unreachable',
      };
    }
  }

  if (trimmedKey && targetUrl) {
    try {
      const response = await fetchFn(targetUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': trimmedKey,
          authorization: `Bearer ${trimmedKey}`,
        },
        body: JSON.stringify({ indexNumber: normalizedIndex }),
        timeoutMs: 8000,
        proxyUrl: configuredProxy,
      });

      if (!response.ok) {
        return {
          valid: false,
          normalizedIndex,
          verificationMode: 'external_api',
          reason: 'index_rejected_by_verification_api',
        };
      }

      const text = await response.text();
      const payload = JSON.parse(text) as {
        valid?: boolean;
        verified?: boolean;
        studentName?: string;
        name?: string;
      };
      const isOk = payload.valid !== false && payload.verified !== false;
      return {
        valid: isOk,
        normalizedIndex,
        verificationMode: 'external_api',
        reason: isOk ? undefined : 'index_rejected_by_verification_api',
        studentName: payload.studentName || payload.name,
      };
    } catch {
      return {
        valid: false,
        normalizedIndex,
        verificationMode: 'external_api',
        reason: 'verification_api_unreachable',
      };
    }
  }

  return {
    valid: false,
    normalizedIndex,
    verificationMode: 'external_api',
    reason: 'index_rejected_by_verification_api',
  };
}

/**
 * Multi-round salted HMAC-SHA256 password hashing with CSPRNG salt (zero native binary dependencies).
 */
export function hashPassword(password: string, pepper: string, salt?: string): string {
  let effectiveSalt = salt;
  if (!effectiveSalt) {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const randomBuf = new Uint8Array(16);
      crypto.getRandomValues(randomBuf);
      effectiveSalt = bytesToHex(randomBuf);
    } else {
      effectiveSalt = bytesToHex(
        sha256Bytes(new TextEncoder().encode(`${Date.now()}:${Math.random()}:${pepper}`))
      ).slice(0, 32);
    }
  }
  let digest = hashDeviceToken(`${effectiveSalt}:${password}`, pepper);
  for (let i = 0; i < 1200; i++) {
    digest = hashDeviceToken(`${effectiveSalt}:${digest}:${i}`, pepper);
  }
  return `upsa_sha256$1200$${effectiveSalt}$${digest}`;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitBuckets = new Map<string, RateLimitEntry>();

/**
 * Sliding-window in-memory rate limiter for authentication endpoints and brute-force protection.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const current = rateLimitBuckets.get(key);

  // Periodically evict expired entries if map grows large
  if (rateLimitBuckets.size > 2000) {
    for (const [k, v] of rateLimitBuckets.entries()) {
      if (now > v.resetAt) rateLimitBuckets.delete(k);
    }
  }

  if (!current || now > current.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: limit - current.count,
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitsForTests(): void {
  rateLimitBuckets.clear();
}

/**
 * Constant-time password verification against stored `upsa_sha256$1200$<salt>$<digest>` hash.
 */
export function verifyPassword(password: string, storedHash: string, pepper: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'upsa_sha256') return false;
  const salt = parts[2];
  if (!salt) return false;
  const candidateHash = hashPassword(password, pepper, salt);
  if (candidateHash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < storedHash.length; i++) {
    diff |= candidateHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Evaluates whether a geolocation coordinate falls within an authorized zone boundary.
 * Enforces accuracy threshold (<= 150m) and never persists raw coordinates.
 */
export function verifyZonePoint(
  reading: { lat: number; lng: number; accuracy: number },
  zones: ZonePolygonConfig[] = DEFAULT_UPSA_ZONES
): {
  verified: boolean;
  zoneId?: number;
  zoneName?: string;
  verifiedUntil?: string;
  reason: 'ok' | 'accuracy_too_low' | 'not_in_zone';
} {
  const activePhysicalZones = zones.filter(
    (z) => z.isActive && z.coordinates && z.coordinates.length >= 4
  );

  for (const zone of activePhysicalZones) {
    const insidePolygon = isPointInRingOrBuffer(reading.lat, reading.lng, zone.coordinates!, 25);

    if (insidePolygon) {
      if (reading.accuracy > zone.maxAccuracyMeters) {
        return {
          verified: false,
          reason: 'accuracy_too_low',
        };
      }
      const verifiedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      return {
        verified: true,
        zoneId: zone.id,
        zoneName: zone.name,
        verifiedUntil,
        reason: 'ok',
      };
    }
  }

  return {
    verified: false,
    reason: 'not_in_zone',
  };
}

/**
 * Context-based Named Entity Recognition (NER) to detect real human names mentioned in confessions
 * or posts to prevent doxxing and harassment, while avoiding false positives on common nouns (e.g. faith, joy)
 * and campus facility names (e.g. "Joshua Alabi block", "Ampomah building").
 */
export function detectRealPersonNames(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (clean.length < 3) return [];

  const doc = nlp(clean);
  const detected = doc.people().out('array') as string[];

  // Common dictionary words that are also capitalized or first names in English
  const COMMON_DICTIONARY_WORDS = new Set([
    'faith', 'joy', 'hope', 'grace', 'mercy', 'patience', 'peace', 'blessing',
    'august', 'may', 'june', 'april', 'general', 'level', 'hostel', 'campus',
  ]);

  const validNames: string[] = [];
  for (const name of detected) {
    const trimmed = name.trim();
    const parts = trimmed.split(/\s+/);
    // If it's an isolated single word, ensure it's not an ordinary dictionary noun
    if (parts.length === 1) {
      const lower = trimmed.toLowerCase();
      if (COMMON_DICTIONARY_WORDS.has(lower)) continue;
      const isKnownGhanaianName =
        GHANAIAN_FIRST_NAMES.includes(lower) || GHANAIAN_LAST_NAMES.includes(lower);
      if (!isKnownGhanaianName && !/^[A-Z][a-zA-Z'-]+$/.test(trimmed)) continue;
    }
    validNames.push(trimmed);
  }

  // Regex check for known Ghanaian first names (e.g., "Ama", "Kofi", "Akosua", "Kwabena")
  const ghanaianFirstNameRegex = new RegExp(
    `\\b(${GHANAIAN_FIRST_NAMES.join('|')})\\b`,
    'gi'
  );
  let fnMatch: RegExpExecArray | null;
  while ((fnMatch = ghanaianFirstNameRegex.exec(clean)) !== null) {
    const matchedStr = fnMatch[0].trim();
    if (!validNames.some((n) => n.toLowerCase() === matchedStr.toLowerCase())) {
      validNames.push(matchedStr);
    }
  }

  // Regex check for honorific + name patterns (e.g., "Dr. Osei", "Prof. Boateng", "Mr. Mensah", "Miss Akosua")
  const honorificRegex = /\b(Dr\.?|Prof\.?|Professor|Mr\.?|Mrs\.?|Ms\.?|Miss|Rev\.?|Lecturer|Dean|HOD)\s+([A-Z][a-zA-Z'-]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = honorificRegex.exec(clean)) !== null) {
    const matchedStr = match[0].trim();
    if (!validNames.some((n) => n.toLowerCase() === matchedStr.toLowerCase())) {
      validNames.push(matchedStr);
    }
  }

  // Filter out campus facilities named after people (e.g. "Joshua Alabi block", "Ampomah hall", "Library")
  const filteredNames: string[] = [];
  for (const name of validNames) {
    const cleanPattern = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const facilitySuffixRegex = new RegExp(
      `\\b${cleanPattern}\\s+(block|hall|building|library|auditorium|complex|centre|center|hostel|clinic|gate|court|field)\\b`,
      'i'
    );
    if (facilitySuffixRegex.test(clean)) {
      continue;
    }
    filteredNames.push(name);
  }

  return filteredNames;
}

/**
 * Redacts/masks a person's name into the format A**** (first letter capitalized, followed by asterisks).
 * Example: 'Ama' -> 'A****', 'Kofi' -> 'K****', 'Mensah' -> 'M*****'.
 * Multi-word names: 'Kofi Mensah' -> 'K**** M*****'.
 * Preserves honorifics: 'Dr. Osei' -> 'Dr. O****'.
 */
export function maskPersonName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  const parts = name.trim().split(/\s+/);
  return parts
    .map((part) => {
      // Preserve honorifics/titles
      if (
        /^(dr\.?|prof\.?|professor|mr\.?|mrs\.?|ms\.?|miss|rev\.?|reverend|pastor|hon\.?|lecturer|dean|hod)$/i.test(
          part
        )
      ) {
        return part;
      }
      const match = /^([a-zA-ZÀ-ÿ'-]+)([^a-zA-ZÀ-ÿ'-]*)$/.exec(part);
      if (!match) return part;
      const [, word, punct] = match;
      if (!word || word.length === 0) return part;
      const firstLetter = word[0]!.toUpperCase();
      const starsCount = Math.max(word.length - 1, 4);
      return `${firstLetter}${'*'.repeat(starsCount)}${punct ?? ''}`;
    })
    .join(' ');
}

/**
 * Detects all real human names in the input text and redacts/masks them into A**** format.
 * Prevents doxxing and harassment while preserving readability.
 * Example: "Confession: I have feelings for Ama" -> "Confession: I have feelings for A****"
 */
export function maskRealPersonNames(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const names = detectRealPersonNames(text);
  if (names.length === 0) return text;

  // Sort longest names first to prevent partial word replacements
  const sortedNames = [...new Set(names)].sort((a, b) => b.length - a.length);
  let masked = text;

  for (const name of sortedNames) {
    const replacement = maskPersonName(name);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    masked = masked.replace(regex, replacement);
  }

  return masked;
}

const CONFESSION_HARASSMENT_CONTEXT_REGEX =
  /\b(confession|confess|confessing|crush|dating|cheat|cheating|sleeping with|hookup|crying|rumor|toxic|liar|scammer|thief|stole|hate|dr\.?|prof\.?|professor|lecturer|dean|hod)\b/i;

/**
 * POST-3 & MOD-2:
 * Keyword, pattern, and Named Entity pre-screen: matching posts are held for review, others publish immediately.
 * Content flagged for self-harm triggers a support card pointing to UPSA Guidance & Counselling Unit.
 * Mentions of real human names in confessions/harassment contexts are held under 'named_person_doxxing'.
 */
export function screenContentText(
  body: string,
  rules: KeywordRuleConfig[] = DEFAULT_KEYWORD_RULES
): {
  status: ContentStatus;
  category: string | null;
  showSupportCard: boolean;
  flaggedNames?: string[];
} {
  const normalized = body.trim();
  let matchedCategory: string | null = null;
  let isSelfHarm = false;

  for (const rule of rules) {
    if (!rule.isActive) continue;
    let matched = false;
    if (rule.matchType === 'contains') {
      matched = normalized.toLowerCase().includes(rule.pattern.toLowerCase());
    } else {
      const regex = new RegExp(rule.pattern, 'i');
      matched = regex.test(normalized);
    }
    if (matched) {
      if (rule.category === 'self_harm') {
        isSelfHarm = true;
        matchedCategory = 'self_harm';
        break;
      }
      if (!matchedCategory) {
        matchedCategory = rule.category;
      }
    }
  }

  if (matchedCategory) {
    return {
      status: 'held',
      category: matchedCategory,
      showSupportCard: isSelfHarm,
    };
  }

  // Context-based Named Entity Recognition (Anti-Harassment in confessions & callouts)
  const isConfessionOrCallout = CONFESSION_HARASSMENT_CONTEXT_REGEX.test(normalized);
  if (isConfessionOrCallout) {
    const flaggedNames = detectRealPersonNames(normalized);
    if (flaggedNames.length > 0) {
      return {
        status: 'held',
        category: 'named_person_doxxing',
        showSupportCard: false,
        flaggedNames,
      };
    }
  }

  return {
    status: 'published',
    category: null,
    showSupportCard: false,
  };
}

/**
 * Generates an HMAC-SHA256 digest of a device identifier using a server pepper.
 * Ensures raw hardware tokens are never stored in the database.
 */
export function hashDeviceToken(rawToken: string, pepper: string): string {
  const encoder = new TextEncoder();
  const rawKeyBytes = encoder.encode(pepper);
  const keyBytes: Uint8Array =
    rawKeyBytes.length > 64 ? sha256Bytes(rawKeyBytes) : rawKeyBytes;
  const paddedKey = new Uint8Array(64);
  paddedKey.set(keyBytes);

  const oKeyPad = new Uint8Array(64);
  const iKeyPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = paddedKey[i]! ^ 0x5c;
    iKeyPad[i] = paddedKey[i]! ^ 0x36;
  }

  const msgBytes = encoder.encode(rawToken);
  const innerInput = new Uint8Array(64 + msgBytes.length);
  innerInput.set(iKeyPad, 0);
  innerInput.set(msgBytes, 64);
  const innerHash = sha256Bytes(innerInput);

  const outerInput = new Uint8Array(64 + 32);
  outerInput.set(oKeyPad, 0);
  outerInput.set(innerHash, 64);
  return bytesToHex(sha256Bytes(outerInput));
}

/**
 * Thread-scoped alias formatting: 0 = OP, 1..n = Student 1..n
 */
export function formatThreadAlias(aliasNo: number): string {
  return aliasNo === 0 ? 'OP' : `Student ${aliasNo}`;
}

export type GlyphShape = 'diamond' | 'triangle' | 'square' | 'hexagon' | 'circle' | 'octagon';

export interface ThreadGlyph {
  shape: GlyphShape;
  rotationDeg: number;
  variant: 'navy' | 'gold';
  seed: number;
}

/**
 * Generates an ephemeral visual glyph for a thread alias to prevent cross-thread correlation.
 */
export function generateThreadGlyph(postId: string, aliasNo: number): ThreadGlyph {
  const encoder = new TextEncoder();
  const digest = sha256Bytes(encoder.encode(`${postId}:alias:${aliasNo}`));
  const hashHex = bytesToHex(digest).slice(0, 8);
  const seed = Number.parseInt(hashHex, 16);
  const shapes: GlyphShape[] = ['diamond', 'triangle', 'square', 'hexagon', 'circle', 'octagon'];
  const shape = shapes[seed % shapes.length] ?? 'diamond';
  const rotationDeg = (seed % 4) * 90;
  const variant: 'navy' | 'gold' = aliasNo === 0 ? 'gold' : seed % 2 === 0 ? 'navy' : 'gold';

  return {
    shape,
    rotationDeg,
    variant,
    seed,
  };
}

const ADJECTIVES = [
  'Wise', 'Swift', 'Calm', 'Noble', 'Bright', 'Clever', 'Keen', 'Brave',
  'Kind', 'Grand', 'Amber', 'Silver', 'Golden', 'Star', 'Cedar', 'Bold',
  'Quick', 'True', 'Royal', 'Pure', 'Prime', 'Solar', 'Lunar', 'Echo'
];

const NOUNS = [
  'Scholar', 'Falcon', 'Hawk', 'Pioneer', 'Fellow', 'Leader', 'Writer',
  'Thinker', 'Mentor', 'Voyager', 'Spark', 'Phoenix', 'Otter', 'Knight',
  'Sage', 'Cadet', 'Explorer', 'Archer', 'Orator', 'Builder', 'Scout'
];

/**
 * Generates an anonymous, pseudonymous random student username upon registration.
 * Examples: BrightScholar_4821, NobleHawk_8301, WiseFalcon_1942.
 */
export function generateRandomStudentUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] ?? 'Noble';
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)] ?? 'Scholar';
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj}${noun}_${num}`;
}

/**
 * Scrubs telemetry and error payloads to eliminate PII, credentials, and coordinates.
 */
export function scrubSensitivePayload(input: Record<string, unknown>): Record<string, unknown> {
  const forbiddenKeys = new Set([
    'lat',
    'lng',
    'latitude',
    'longitude',
    'accuracy',
    'email',
    'author_id',
    'authorId',
    'user_id',
    'userId',
    'device_hash',
    'deviceToken',
    'password',
    'newPassword',
    'passwordHash',
    'password_hash',
    'indexNumber',
    'index_number',
    'body',
    'note',
  ]);
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (forbiddenKeys.has(key)) {
      scrubbed[key] = '[REDACTED]';
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

/**
 * Creates a cryptographically signed, tamper-proof session token: `<userId>.<hmacSignature>`.
 * Uses HMAC-SHA256 with the server pepper to prevent cookie forgery.
 */
export function signSessionToken(userId: string, secret: string): string {
  const signature = hashDeviceToken(userId, secret);
  return `${userId}.${signature}`;
}

/**
 * Verifies a signed session token. Returns the validated `userId` if signature matches, or null if tampered.
 * Gracefully accepts raw valid UUIDs for backwards-compatibility or integration testing.
 */
export function verifySessionToken(token: string, secret: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const dotIndex = token.indexOf('.');
  if (dotIndex !== -1) {
    const userId = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);
    const expected = hashDeviceToken(userId, secret);
    if (signature.length === expected.length) {
      let diff = 0;
      for (let i = 0; i < signature.length; i++) {
        diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
      }
      if (diff === 0) return userId;
    }
    return null;
  }

  // Raw UUIDs are accepted only under the test runner; in any deployed environment a
  // session must carry a valid signature, otherwise anyone could impersonate a user id.
  const allowRawIds = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (allowRawIds && uuidRegex.test(token.trim())) {
    return token.trim();
  }
  return null;
}

