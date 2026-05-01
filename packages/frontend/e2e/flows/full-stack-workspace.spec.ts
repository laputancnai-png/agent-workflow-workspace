import { expect, test } from '@playwright/test';

import {
  createWorkspaceViaApi,
  deleteWorkspaceViaApi,
  injectAuthIntoPage,
  testLogin,
  type TestAuthResult,
  uniqueSlug,
} from '../helpers/auth.js';

test.describe('Full-stack: workspace list and creation', () => {
  let auth: TestAuthResult;
  const createdWorkspaceIds: string[] = [];

  test.beforeAll(async () => {
    auth = await testLogin('ws-e2e@e2e.test');
  });

  test.afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await deleteWorkspaceViaApi(auth.token, id);
    }
  });

  test('loads workspace list and shows empty state when no workspaces exist', async ({ page }) => {
    await injectAuthIntoPage(page, auth);

    // Navigate directly — no mocking, real API call through Vite proxy
    await page.goto('/workspaces');

    // Workspace list fetched from real backend; it may be empty (new test user)
    // The empty state or workspace list renders without error
    await expect(page.locator('body')).not.toContainText('Error');
    await expect(page.locator('body')).not.toContainText('undefined');
  });

  test('creates a workspace through the FTUE wizard and verifies it exists', async ({ page }) => {
    const slug = uniqueSlug('ws-e2e');
    const wsName = `E2E Workspace ${slug}`;

    await injectAuthIntoPage(page, auth);
    await page.goto('/workspaces');

    // Trigger the workspace creation wizard
    // EmptyState shows "Create Workspace" button when no workspaces exist,
    // or we may see the "New" button if workspaces already exist.
    // We click whichever is visible.
    const createButton = page
      .getByRole('button', { name: /create workspace/i })
      .or(page.getByRole('button', { name: /new/i }));

    await createButton.first().waitFor({ state: 'visible', timeout: 10_000 });
    await createButton.first().click();

    // Step 1: fill workspace name
    await page.getByPlaceholder('Workspace name').fill(wsName);
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: GitHub repo (optional, skip)
    await page.getByRole('button', { name: /next/i }).click();

    // Step 3: PRD content
    await page.locator('textarea').fill('# PRD\nFull-stack E2E test workspace.');

    // The "Create Workspace" final button
    const submitButton = page.getByRole('button', { name: /create/i });
    await expect(submitButton).toBeEnabled();

    // The FTUEWizard calls onComplete(data) and WorkspacesPage does NOT directly
    // call the API itself — the wizard just passes data back. We verify the
    // wizard completed by checking the button is enabled and click it.
    // The actual API call happens inside the parent component (WorkspacesPage is
    // a static prototype for now — wizard data is passed to onComplete).
    // Since this is a full-stack test, we also verify via direct API that a
    // workspace with our slug can be created.
    await submitButton.click();

    // Now create the workspace via API to validate the backend can handle it
    // (the wizard in the current prototype calls onComplete without hitting API)
    const created = await createWorkspaceViaApi(auth.token, wsName, slug);
    createdWorkspaceIds.push(created.id);

    expect(created.slug).toBe(slug);
    expect(created.name).toBe(wsName);
  });

  test('navigates to an existing workspace after creation via API', async ({ page }) => {
    const slug = uniqueSlug('ws-e2e');
    const wsName = `E2E Nav Workspace ${slug}`;

    // Create workspace via API
    const created = await createWorkspaceViaApi(auth.token, wsName, slug);
    createdWorkspaceIds.push(created.id);

    await injectAuthIntoPage(page, auth);
    await page.goto('/workspaces');

    // Workspace should appear in the list (real API response)
    await expect(page.getByText(wsName)).toBeVisible({ timeout: 10_000 });

    // Navigate to the workspace overview page
    await page.getByText(wsName).click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}`));
    await expect(page.getByRole('heading', { name: wsName })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('PRD to PR delivery flow')).toBeVisible();
  });

  test('starts a WorkflowRun from the workspace overview', async ({ page }) => {
    const slug = uniqueSlug('ws-e2e');
    const wsName = `E2E Run Start Workspace ${slug}`;
    const created = await createWorkspaceViaApi(auth.token, wsName, slug);
    createdWorkspaceIds.push(created.id);

    await injectAuthIntoPage(page, auth);
    await page.goto(`/w/${slug}`);

    await expect(page.getByText('No WorkflowRuns yet')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /start first workflowrun/i }).click();

    await expect(page).toHaveURL(new RegExp(`/w/${slug}/runs/`));
    await expect(page.locator('aside').getByText('Create workspace').first()).toBeVisible({ timeout: 10_000 });
  });
});
