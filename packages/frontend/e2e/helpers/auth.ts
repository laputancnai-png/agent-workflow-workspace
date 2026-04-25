import type { Page } from '@playwright/test';

const BACKEND_URL = 'http://localhost:3000';

export interface TestUser {
  id: string;
  login: string;
  email: string;
  preferred_language: string;
}

export interface TestAuthResult {
  token: string;
  user: TestUser;
}

export async function testLogin(email: string): Promise<TestAuthResult> {
  const response = await fetch(`${BACKEND_URL}/api/v1/auth/test-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`test-login failed for ${email}: ${response.status} ${text}`);
  }

  const json = (await response.json()) as {
    data: { access_token: string; user: TestUser };
  };

  return { token: json.data.access_token, user: json.data.user };
}

export async function injectAuthIntoPage(page: Page, auth: TestAuthResult): Promise<void> {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem(
      'aww-auth',
      JSON.stringify({
        state: {
          token,
          user: {
            id: user.id,
            name: user.login,
            email: user.email,
            preferred_language: user.preferred_language,
          },
        },
        version: 0,
      }),
    );
    localStorage.setItem('aww-lang', 'en');
  }, auth);
}

export interface CreatedWorkspace {
  id: string;
  slug: string;
  name: string;
}

export async function createWorkspaceViaApi(token: string, name: string, slug: string): Promise<CreatedWorkspace> {
  const response = await fetch(`${BACKEND_URL}/api/v1/workspaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, slug }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`createWorkspaceViaApi failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as { data: CreatedWorkspace };
  return json.data;
}

export async function deleteWorkspaceViaApi(token: string, workspaceId: string): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/api/v1/workspaces/${workspaceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok && response.status !== 404) {
    console.warn(`deleteWorkspaceViaApi: unexpected status ${response.status} for workspace ${workspaceId}`);
  }
}

export interface CreatedRun {
  id: string;
  workspace_id: string;
  status: string;
  steps: Array<{ id: string; position: number; name: string; owner_type: string; status: string }>;
}

export async function createRunViaApi(token: string, workspaceId: string): Promise<CreatedRun> {
  const response = await fetch(`${BACKEND_URL}/api/v1/workspaces/${workspaceId}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ template_id: 'builtin-9step' }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`createRunViaApi failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as { data: CreatedRun };
  return json.data;
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
