export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete(path: string): Promise<void>;
}

interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => string | null;
}

function resolveUrl(baseUrl: string, path: string): string {
  if (baseUrl) return `${baseUrl}${path}`;
  return path;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const token = opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(resolveUrl(opts.baseUrl, path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T;

    const json = (await response.json()) as { data?: T; error?: string };
    if (!response.ok) throw new ApiError(response.status, json, json.error ?? `HTTP ${response.status}`);

    return json.data as T;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path).then(() => undefined)
  };
}

let client: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (!client) client = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE ?? '' });
  return client;
}

export function setApiClientFactory(factory: () => ApiClient): void {
  client = factory();
}
