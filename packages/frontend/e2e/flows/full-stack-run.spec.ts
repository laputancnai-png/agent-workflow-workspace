import { expect, test } from '@playwright/test';

import {
  createRunViaApi,
  createWorkspaceViaApi,
  deleteWorkspaceViaApi,
  injectAuthIntoPage,
  testLogin,
  type CreatedRun,
  type CreatedWorkspace,
  type TestAuthResult,
  uniqueSlug,
} from '../helpers/auth.js';

test.describe('Full-stack: workflow run detail page', () => {
  let auth: TestAuthResult;
  let workspace: CreatedWorkspace;
  let run: CreatedRun;

  test.beforeAll(async () => {
    auth = await testLogin('run-e2e@e2e.test');

    const slug = uniqueSlug('ws-e2e');
    workspace = await createWorkspaceViaApi(auth.token, `Run E2E Workspace ${slug}`, slug);
    run = await createRunViaApi(auth.token, workspace.id);
  });

  test.afterAll(async () => {
    if (workspace?.id) {
      await deleteWorkspaceViaApi(auth.token, workspace.id);
    }
  });

  test('renders WorkflowTimeline with real steps from the backend', async ({ page }) => {
    await injectAuthIntoPage(page, auth);

    await page.goto(`/w/${workspace.slug}/runs/${run.id}`);

    // The WorkflowTimeline renders a button for each step
    // The 9-step template has 9 steps
    const stepButtons = page.locator('aside button[type="button"]');
    await expect(stepButtons.first()).toBeVisible({ timeout: 10_000 });

    const count = await stepButtons.count();
    expect(count).toBe(9);
  });

  test('renders the step name from the real API response', async ({ page }) => {
    await injectAuthIntoPage(page, auth);

    await page.goto(`/w/${workspace.slug}/runs/${run.id}`);

    // The first step is "Create workspace" — target the timeline button specifically
    await expect(page.locator('aside').getByText('Create workspace').first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows PRD input panel for the Import PRD step and submits it', async ({ page }) => {
    // The template has Import PRD (pos 2, approval_gate) as the step where users
    // paste their PRD. Step 1 (Create workspace) is already running on a fresh run.
    // We need to advance step 1 to completed so step 2 becomes active.
    const step1 = run.steps.find((s) => s.position === 1);
    expect(step1).toBeDefined();
    if (!step1) return;

    // Approve step 1 so step 2 (Import PRD) gets activated
    await fetch(`http://localhost:3000/api/v1/steps/${step1.id}/decision`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });

    await injectAuthIntoPage(page, auth);

    // Intercept SSE so it does not block
    await page.route(`**/api/v1/workspaces/${workspace.slug}/events**`, (route) =>
      route.fulfill({ status: 204, body: '' }),
    );

    await page.goto(`/w/${workspace.slug}/runs/${run.id}`);

    // Select the Import PRD step in the timeline
    await page.locator('aside').getByText('Import PRD').first().click();

    // PRDInputPanel should be shown — textarea and submit button visible
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Fill in PRD content to enable the submit button
    await textarea.fill('# PRD\nThis is an E2E test PRD.');

    const submitButton = page.getByRole('button', { name: /提交 PRD/i });
    await expect(submitButton).toBeEnabled({ timeout: 5_000 });

    // Click submit — fires a real POST /api/v1/steps/:stepId/decision with artifact_content
    await submitButton.click();

    // Toast confirms the decision was submitted
    await expect(page.getByText('Decision submitted')).toBeVisible({ timeout: 10_000 });
  });
});
