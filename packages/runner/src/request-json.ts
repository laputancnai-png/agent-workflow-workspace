import http from 'node:http';
import https from 'node:https';

export async function requestJson<T>(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number } = {}
) {
  return new Promise<T>((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
    const request = client.request(
      parsed,
      {
        method: init.method ?? 'GET',
        headers: {
          ...(body ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)) } : {}),
          ...init.headers,
        },
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          const status = response.statusCode ?? 0;

          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status}: ${raw}`));
            return;
          }

          const parsedBody = raw ? (JSON.parse(raw) as { data?: T }) : {};
          resolve((parsedBody.data ?? parsedBody) as T);
        });
      },
    );

    request.on('error', reject);
    request.setTimeout(init.timeoutMs ?? 120_000, () => {
      request.destroy(new Error(`HTTP timeout for ${parsed.pathname}`));
    });
    if (body) {
      request.write(body);
    }
    request.end();
  });
}
