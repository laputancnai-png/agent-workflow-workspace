import { useAuthStore } from '../stores/auth.store.js';

export class ApiError extends Error {
  public i18nKey: string;

  constructor(
    public status: number,
    public body: unknown,
    message: string,
    i18nKey = 'errors.unknown_error'
  ) {
    super(message);
    this.name = 'ApiError';
    this.i18nKey = i18nKey;
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
  setToken?: (token: string | null) => void;
}

function resolveUrl(baseUrl: string, path: string): string {
  if (baseUrl) return `${baseUrl}${path}`;
  return path;
}

function mapErrorKey(status: number, errorCode?: string) {
  if (errorCode === 'network_error') return 'errors.network_error';
  if (status === 401) return 'errors.unauthorized';
  if (status === 403) return 'errors.forbidden';
  if (status === 404) return 'errors.not_found';
  if (status >= 500) return 'errors.server_error';
  return 'errors.unknown_error';
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  async function refreshAccessToken() {
    const response = await fetch(resolveUrl(opts.baseUrl, '/api/v1/auth/refresh'), {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      opts.setToken?.(null);
      throw new ApiError(response.status, undefined, 'refresh_failed', mapErrorKey(response.status));
    }

    const json = (await response.json()) as { accessToken?: string };
    if (!json.accessToken) {
      opts.setToken?.(null);
      throw new ApiError(401, json, 'refresh_failed', 'errors.unauthorized');
    }

    opts.setToken?.(json.accessToken);
    return json.accessToken;
  }

  async function request<T>(method: string, path: string, body?: unknown, hasRetried = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const token = opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(resolveUrl(opts.baseUrl, path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include'
    });

    if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T;

    const json = (await response.json()) as { data?: T; error?: string };
    if (!response.ok) {
      if (response.status === 401 && opts.setToken && !hasRetried && path !== '/api/v1/auth/refresh') {
        await refreshAccessToken();
        return request(method, path, body, true);
      }

      throw new ApiError(
        response.status,
        json,
        json.error ?? mapErrorKey(response.status, json.error),
        mapErrorKey(response.status, json.error)
      );
    }

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
  if (!client) {
    client = createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE ?? '',
      getToken: () => useAuthStore.getState().token,
      setToken: (token) => useAuthStore.getState().setToken(token)
    });
  }
  return client;
}

export function setApiClientFactory(factory: () => ApiClient): void {
  client = factory();
}
