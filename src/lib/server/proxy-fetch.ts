import http from 'node:http';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';

export interface ProxyFetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  proxyUrl?: string;
  maxRedirects?: number;
}

export interface ProxyFetchResult {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Executes an HTTP or HTTPS request using an HTTP/HTTPS proxy agent if configured.
 * Follows redirects (301, 302, 303, 307, 308) up to `maxRedirects`.
 */
export function executeFetchWithProxy(
  urlStr: string,
  options: ProxyFetchOptions = {}
): Promise<ProxyFetchResult> {
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs ?? 8000;
  const proxyUrl =
    options.proxyUrl?.trim() ||
    process.env.UPSA_INDEX_VERIFICATION_PROXY_URL?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim();

  return new Promise((resolve, reject) => {
    function makeRequest(currentUrl: string, redirectsRemaining: number) {
      try {
        const url = new URL(currentUrl);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        let agent: http.Agent | https.Agent | undefined;
        if (proxyUrl) {
          agent = (isHttps
            ? new HttpsProxyAgent(proxyUrl)
            : new HttpProxyAgent(proxyUrl)) as unknown as http.Agent;
        }

        const req = client.request(
          url,
          {
            method: options.method || 'GET',
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              ...(options.headers || {}),
            },
            agent,
            timeout: timeoutMs,
          },
          (res) => {
            if (
              [301, 302, 303, 307, 308].includes(res.statusCode || 0) &&
              res.headers.location &&
              redirectsRemaining > 0
            ) {
              const redirectUrl = new URL(res.headers.location, currentUrl).toString();
              res.resume();
              return makeRequest(redirectUrl, redirectsRemaining - 1);
            }

            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              const status = res.statusCode || 200;
              resolve({
                ok: status >= 200 && status < 300,
                status,
                headers: res.headers,
                text: async () => data,
              });
            });
          }
        );

        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`Request timeout after ${timeoutMs}ms`));
        });

        req.on('error', (err) => {
          reject(err);
        });

        if (options.body) {
          req.write(options.body);
        }
        req.end();
      } catch (err) {
        reject(err);
      }
    }

    makeRequest(urlStr, maxRedirects);
  });
}

/**
 * High-level fetch wrapper:
 * - If a proxy URL is specified or present in environment, routes via `executeFetchWithProxy`.
 * - If in test environment or standard browser/fetch environment without proxy, uses `globalThis.fetch`.
 * - Falls back to `executeFetchWithProxy` if native fetch fails in Node runtime.
 */
export async function fetchWithOptionalProxy(
  urlStr: string,
  options: ProxyFetchOptions = {}
): Promise<ProxyFetchResult> {
  const proxyUrl =
    options.proxyUrl?.trim() ||
    process.env.UPSA_INDEX_VERIFICATION_PROXY_URL?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim();

  if (!proxyUrl && typeof globalThis.fetch === 'function') {
    try {
      const resp = await globalThis.fetch(urlStr, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      });
      return {
        ok: resp.ok,
        status: resp.status,
        text: () => resp.text(),
      };
    } catch (err) {
      if (typeof window === 'undefined') {
        return executeFetchWithProxy(urlStr, options);
      }
      throw err;
    }
  }

  return executeFetchWithProxy(urlStr, options);
}
