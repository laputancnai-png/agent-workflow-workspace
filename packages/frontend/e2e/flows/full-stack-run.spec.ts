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

    // The first step is "Create workspace"
    await expect(page.getByText('Create workspace')).toBeVisible({ timeout: 10_000 });
  });

  test('shows ApprovalActionBar for the running approval_gate step and approves it', async ({ page }) => {
    // Advance step 1 ("Create workspace", owner_type=human) to running so we can
    // transition it to an approval_gate step. The template has Import PRD (pos 2)
    // as approval_gate. We need to put it in running state.
    const approvalStep = run.steps.find(
      (s) => s.owner_type === 'approval_gate' && s.position === 2,
    );
    expect(approvalStep).toBeDefined();

    if (!approvalStep) return;

    // Advance the step to running via the start endpoint
    const startResponse = await fetch(`http://localhost:3000/api/v1/steps/${approvalStep.id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    expect(startResponse.ok).toBe(true);

    await injectAuthIntoPage(page, auth);
    await page.goto(`/w/${workspace.slug}/runs/${run.id}`);

    // Select the running approval step in the timeline
    await page.getByText('Import PRD').click();

    // ApprovalActionBar should be visible because owner_type === 'approval_gate'
    const approveButton = page.getByRole('button', { name: 'Approve', exact: true });
    await expect(approveButton).toBeVisible({ timeout: 10_000 });

    // Intercept the SSE connection so it does not block
    await page.route(`**/api/v1/workspaces/${workspace.slug}/events**`, (route) =>
      route.fulfill({ status: 204, body: '' }),
    );

    // Click Approve — this fires a real POST /api/v1/steps/:stepId/decision
    await approveButton.click();

    // Toast confirms the decision was submitted
    await expect(page.getByText('Decision submitted')).toBeVisible({ timeout: 10_000 });
  });
});
