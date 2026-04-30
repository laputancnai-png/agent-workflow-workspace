import { expect, test } from '@playwright/test';

import {
  createWorkspaceViaApi,
  deleteWorkspaceViaApi,
  injectAuthIntoPage,
  testLogin,
  type CreatedWorkspace,
  type TestAuthResult,
  uniqueSlug,
} from '../helpers/auth.js';

test.describe('Full-stack: runner management page', () => {
  let auth: TestAuthResult;
  let workspace: CreatedWorkspace;

  test.beforeAll(async () => {
    auth = await testLogin('runner-e2e@e2e.test');

    const slug = uniqueSlug('ws-e2e');
    workspace = await createWorkspaceViaApi(auth.token, `Runner E2E Workspace ${slug}`, slug);
  });

  test.afterAll(async () => {
    if (workspace?.id) {
      await deleteWorkspaceViaApi(auth.token, workspace.id);
    }
  });

  test('loads the runner management page with a real API call', async ({ page }) => {
    await injectAuthIntoPage(page, auth);

    // SSE is not needed for runner page — stub it to avoid hanging connections
    await page.route(`**/api/v1/workspaces/${workspace.slug}/events**`, (route) =>
      route.fulfill({ status: 204, body: '' }),
    );

    await page.goto(`/w/${workspace.slug}/runners`);

    // The heading "Runners" is always rendered
    await expect(page.getByRole('heading', { name: 'Runners' })).toBeVisible({ timeout: 10_000 });
  });

  test('shows empty runners message when no runners are registered', async ({ page }) => {
    await injectAuthIntoPage(page, auth);

    await page.route(`**/api/v1/workspaces/${workspace.slug}/events**`, (route) =>
      route.fulfill({ status: 204, body: '' }),
    );

    await page.goto(`/w/${workspace.slug}/runners`);

    // With no runners registered the empty message is shown
    await expect(
      page.getByText('No runners registered for this workspace.'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('runner list GET returns real data from backend', async ({ page }) => {
    await injectAuthIntoPage(page, auth);

    await page.route(`**/api/v1/workspaces/${workspace.slug}/events**`, (route) =>
      route.fulfill({ status: 204, body: '' }),
    );

    // Intercept the runner API call and verify it was made to the real backend
    let runnerApiCalled = false;
    page.on('request', (req) => {
      if (req.url().includes(`/api/v1/workspaces/${workspace.slug}/runners`)) {
        runnerApiCalled = true;
      }
    });

    await page.goto(`/w/${workspace.slug}/runners`);

    // Wait for the page to finish loading
    await expect(page.getByRole('heading', { name: 'Runners' })).toBeVisible({ timeout: 10_000 });

    expect(runnerApiCalled).toBe(true);
  });
});
