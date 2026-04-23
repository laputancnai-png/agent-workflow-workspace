import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApiClient } from '../../src/lib/api-client.js';
import { server } from '../mocks/server.js';

describe('ApiClient', () => {
  const client = createApiClient({ baseUrl: '' });

  beforeEach(() => {
    localStorage.clear();
  });

  it('GET returns parsed data', async () => {
    server.use(http.get('/api/v1/workspaces', () => HttpResponse.json({ data: [{ id: 'ws_1' }] })));
    const result = await client.get<Array<{ id: string }>>('/api/v1/workspaces');
    expect(result[0].id).toBe('ws_1');
  });

  it('POST sends JSON body', async () => {
    let body: unknown;
    server.use(
      http.post('/api/v1/workspaces', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { id: 'ws_new' } });
      })
    );

    await client.post('/api/v1/workspaces', { name: 'Test WS' });
    expect((body as { name: string }).name).toBe('Test WS');
  });

  it('throws ApiError on 401', async () => {
    server.use(http.get('/api/v1/workspaces', () => HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })));
    await expect(client.get('/api/v1/workspaces')).rejects.toMatchObject({ status: 401 });
  });
});
