import { expect, test } from '@playwright/test';

test('FTUE wizard - zh-CN - creates workspace', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'aww-auth',
      JSON.stringify({
        state: {
          token: 'test-token',
          user: { id: 'u1', name: 'Test', email: 't@example.com', preferred_language: 'zh-CN' }
        },
        version: 0
      })
    );
    localStorage.setItem('aww-lang', 'zh-CN');
  });

  await page.route('**/api/v1/workspaces', (route) => route.fulfill({ json: { data: [] } }));

  await page.goto('/workspaces');
  await expect(page.getByRole('button', { name: '创建 Workspace' })).toBeVisible();
  await page.getByRole('button', { name: '创建 Workspace' }).click();
  await page.getByPlaceholder('Workspace name').fill('我的项目');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('textbox').fill('# PRD\n项目需求文档');
  await expect(page.getByRole('button', { name: /创建/ })).toBeEnabled();
});
