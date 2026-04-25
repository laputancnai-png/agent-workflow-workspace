const BACKEND_URL = 'http://localhost:3000';
const E2E_EMAIL = 'e2e-cleanup@e2e.test';

async function getTestToken(): Promise<string | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/auth/test-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: E2E_EMAIL }),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as { data?: { access_token?: string } };
    return json.data?.access_token ?? null;
  } catch {
    return null;
  }
}

async function cleanupE2EWorkspaces(token: string): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/api/v1/workspaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    console.warn('[global-teardown] Could not fetch workspaces for cleanup.');
    return;
  }

  const json = (await response.json()) as { data?: Array<{ id: string; slug: string }> };
  const workspaces = json.data ?? [];

  const e2eWorkspaces = workspaces.filter((ws) => ws.slug.startsWith('ws-e2e-'));

  for (const ws of e2eWorkspaces) {
    try {
      const deleteResponse = await fetch(`${BACKEND_URL}/api/v1/workspaces/${ws.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (deleteResponse.ok || deleteResponse.status === 204) {
        console.log(`[global-teardown] Deleted workspace: ${ws.slug}`);
      } else {
        console.warn(`[global-teardown] Failed to delete workspace ${ws.slug}: ${deleteResponse.status}`);
      }
    } catch (error) {
      console.warn(`[global-teardown] Error deleting workspace ${ws.slug}:`, error);
    }
  }
}

export default async function globalTeardown(): Promise<void> {
  console.log('[global-teardown] Cleaning up E2E test data...');

  const token = await getTestToken();
  if (!token) {
    console.warn('[global-teardown] Could not obtain token — skipping workspace cleanup.');
    return;
  }

  await cleanupE2EWorkspaces(token);
  console.log('[global-teardown] Cleanup complete.');
}
