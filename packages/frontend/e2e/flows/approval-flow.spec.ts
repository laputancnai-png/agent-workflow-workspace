import { expect, test } from '@playwright/test';

test('Approval flow - en - submits approve decision', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'aww-auth',
      JSON.stringify({
        state: {
          token: 'test-token',
          user: { id: 'u1', name: 'Test', email: 't@example.com', preferred_language: 'en' }
        },
        version: 0
      })
    );
    localStorage.setItem('aww-lang', 'en');
  });

  const mockRun = {
    id: 'run_1',
    workspace_id: 'ws_1',
    status: 'running',
    feature_branch: 'aww/ws/run_1',
    steps: [
      { id: 's_1', position: 1, name: 'Create Workspace', status: 'completed', owner_type: 'human', output_artifact_ids: [] },
      { id: 's_2', position: 2, name: 'Add PRD', status: 'completed', owner_type: 'human', output_artifact_ids: [] },
      {
        id: 's_3',
        position: 3,
        name: 'Approve Plan',
        status: 'running',
        owner_type: 'approval_gate',
        output_artifact_ids: []
      }
    ]
  };

  await page.route('**/api/v1/runs/run_1', (route) => route.fulfill({ json: { data: mockRun } }));
  await page.route('**/api/v1/workspaces/test-workspace/events**', (route) =>
    route.fulfill({ status: 204, body: '' })
  );
  await page.route('**/api/v1/steps/s_3/decision', (route) =>
    route.fulfill({ json: { data: { id: 'd_1', action: 'approve' } } })
  );

  await page.goto('/w/test-workspace/runs/run_1');
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Decision submitted')).toBeVisible();
});
