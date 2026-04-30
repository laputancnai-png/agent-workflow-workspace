# AWW Frontend SPA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AWW Frontend SPA — a React 18 + Vite + TypeScript single-page application that faithfully implements the prototype v2 UI, adds i18n (zh-CN/en zero-refresh toggle), connects to AWW Cloud via REST + SSE, and manages state with Zustand + TanStack Query.

**Architecture:** Vite SPA, React Router v6 for routing, Zustand for client-side global state, TanStack Query for server-side cache + optimistic updates, SSE for real-time step/artifact updates, `i18next + react-i18next` for i18n (4 namespaces: common/workflow/approval/errors). Component layers: Primitive → Component → Feature → Page → Layout.

**Tech Stack:** React 18, Vite 5, TypeScript 5, Tailwind CSS 3, Radix UI, React Router v6, Zustand 4, TanStack Query 5, i18next 23, react-i18next, Vitest, Playwright, MSW 2

---

## File Map

```
packages/frontend/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── .env.example
├── src/
│   ├── main.tsx                    # Vite entry
│   ├── App.tsx                     # Providers + Router root
│   ├── i18n/
│   │   ├── index.ts               # i18next init
│   │   └── locales/
│   │       ├── zh-CN/
│   │       │   ├── common.json
│   │       │   ├── workflow.json
│   │       │   ├── approval.json
│   │       │   └── errors.json
│   │       └── en/
│   │           ├── common.json
│   │           ├── workflow.json
│   │           ├── approval.json
│   │           └── errors.json
│   ├── lib/
│   │   ├── api-client.ts          # fetch wrapper: base URL, JWT inject, refresh
│   │   └── query-client.ts        # TanStack QueryClient singleton
│   ├── stores/
│   │   ├── auth.store.ts          # JWT, user, login/logout
│   │   ├── workspace.store.ts     # active workspace slug
│   │   ├── sse.store.ts           # SSE connection state
│   │   └── ui.store.ts            # modals, selected step/artifact
│   ├── hooks/
│   │   ├── useSSEConnection.ts    # EventSource lifecycle + event dispatch
│   │   ├── useWorkspace.ts        # TanStack Query: GET /workspaces/:id
│   │   ├── useRun.ts              # GET /runs/:id (with steps)
│   │   ├── useArtifact.ts         # GET /artifacts/:id + content
│   │   ├── useDecision.ts         # POST /steps/:id/decision mutation
│   │   └── useRunners.ts          # GET /workspaces/:id/runners
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Textarea.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Dialog.tsx
│   │   │   ├── Drawer.tsx
│   │   │   ├── Tooltip.tsx
│   │   │   └── Toast.tsx
│   │   └── common/
│   │       ├── StatusPill.tsx     # step status badge
│   │       ├── Avatar.tsx
│   │       ├── Timeline.tsx
│   │       └── LanguageToggle.tsx # zh-CN / EN switcher
│   ├── features/
│   │   ├── workflow-run/
│   │   │   ├── WorkflowTimeline.tsx   # left sidebar step list
│   │   │   ├── StepDetailPanel.tsx    # center panel: brief + inputs
│   │   │   ├── AgentBanner.tsx        # 90s countdown + ⚠ badge
│   │   │   └── FlowNav.tsx            # handoff map (6 nodes)
│   │   ├── approval/
│   │   │   ├── ApprovalActionBar.tsx  # 5 action buttons
│   │   │   ├── DecisionHistory.tsx    # past decisions feed
│   │   │   └── EditArtifactDrawer.tsx # split-editor for edit action
│   │   ├── artifact/
│   │   │   ├── ArtifactList.tsx
│   │   │   ├── ArtifactViewer.tsx    # Markdown / Code / Plain
│   │   │   └── ArtifactLineage.tsx   # version chain
│   │   ├── diff/
│   │   │   └── DiffViewer.tsx        # code diff with +/- classes
│   │   ├── finding/
│   │   │   └── FindingSel.tsx        # Finding Selector drawer
│   │   ├── take-over/
│   │   │   └── TakeOverModal.tsx     # local instructions modal
│   │   ├── runner/
│   │   │   ├── RunnerList.tsx
│   │   │   └── RegistrationWizard.tsx
│   │   ├── audit/
│   │   │   └── AuditFeed.tsx
│   │   └── onboarding/
│   │       ├── EmptyState.tsx
│   │       └── FTUEWizard.tsx        # 3-step wizard
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── OAuthCallbackPage.tsx
│   │   ├── WorkspacesPage.tsx
│   │   ├── WorkspaceOverviewPage.tsx
│   │   ├── RunDetailPage.tsx         # main work view
│   │   ├── RunnerMgmtPage.tsx
│   │   └── SettingsPage.tsx
│   ├── router/
│   │   └── index.tsx                 # createBrowserRouter + guards
│   └── layout/
│       ├── AppShell.tsx              # 72px nav + sidebar + outlet
│       └── WorkspaceLayout.tsx       # SSE setup + workspace context
├── test/
│   ├── setup.ts                      # MSW server start
│   ├── mocks/
│   │   ├── handlers.ts               # MSW REST handlers
│   │   └── server.ts
│   ├── components/
│   │   ├── ApprovalActionBar.test.tsx
│   │   ├── FTUEWizard.test.tsx
│   │   └── AgentBanner.test.tsx
│   └── hooks/
│       └── useDecision.test.ts
├── e2e/
│   ├── playwright.config.ts
│   ├── fixtures.ts
│   └── flows/
│       ├── approval-flow.spec.ts     # zh-CN + en
│       └── ftue-flow.spec.ts
```

---

## Task 1: Vite + React + TypeScript + Tailwind Setup

**Files:**
- Create: `packages/frontend/package.json`
- Create: `packages/frontend/vite.config.ts`
- Create: `packages/frontend/tailwind.config.ts`
- Create: `packages/frontend/tsconfig.json`
- Create: `packages/frontend/index.html`
- Create: `packages/frontend/src/main.tsx`
- Create: `packages/frontend/src/App.tsx`

- [ ] **Step 1: Create package.json**

```json
// packages/frontend/package.json
{
  "name": "@aww/frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@tanstack/react-query": "^5.40.0",
    "clsx": "^2.1.1",
    "i18next": "^23.11.5",
    "i18next-browser-languagedetector": "^8.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-i18next": "^14.1.2",
    "react-router-dom": "^6.23.1",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0",
    "@testing-library/jest-dom": "^6.4.5",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "jsdom": "^24.1.0",
    "msw": "^2.3.1",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5",
    "vite": "^5.2.13",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
// packages/frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
```

- [ ] **Step 3: Create tailwind.config.ts**

```typescript
// packages/frontend/tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: 'var(--blue)',
        teal: 'var(--teal)',
        green: 'var(--green)',
        amber: 'var(--amber)',
        red: 'var(--red)',
        violet: 'var(--violet)',
      },
    },
  },
} satisfies Config;
```

- [ ] **Step 4: Create index.html**

```html
<!-- packages/frontend/index.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AWW — Agent Workflow Workspace</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/main.tsx**

```tsx
// packages/frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './i18n/index.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 6: Create src/index.css (CSS design tokens from prototype)**

```css
/* packages/frontend/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --blue: #2563eb;
  --teal: #0d9488;
  --green: #16a34a;
  --amber: #d97706;
  --red: #dc2626;
  --violet: #7c3aed;
  --bg: #0f1117;
  --surface: #1a1d27;
  --surface-soft: #22263a;
  --ink: #e2e8f0;
  --muted: #64748b;
  --line: #2d3154;
  --line-strong: #3d4166;
  --shadow: rgba(0,0,0,0.5);
}

body {
  background: var(--bg);
  color: var(--ink);
  font-family: 'Inter', system-ui, sans-serif;
  margin: 0;
}
```

- [ ] **Step 7: Create placeholder App.tsx**

```tsx
// packages/frontend/src/App.tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './lib/query-client.js';
import { router } from './router/index.js';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 8: Install deps and verify Vite starts**

```bash
cd packages/frontend && pnpm install
pnpm dev 2>&1 | head -5
```

Expected: "Local: http://localhost:5173" (Ctrl+C after verification)

- [ ] **Step 9: Commit**

```bash
git add packages/frontend
git commit -m "feat(frontend): Vite + React 18 + TypeScript + Tailwind scaffold"
```

---

## Task 2: i18n Setup + Locale Files

**Files:**
- Create: `packages/frontend/src/i18n/index.ts`
- Create: `packages/frontend/src/i18n/locales/zh-CN/{common,workflow,approval,errors}.json`
- Create: `packages/frontend/src/i18n/locales/en/{common,workflow,approval,errors}.json`
- Create: `packages/frontend/src/components/common/LanguageToggle.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// packages/frontend/test/i18n.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n/index.js';

describe('i18n', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('translates common.save in English', () => {
    expect(i18n.t('save', { ns: 'common' })).toBe('Save');
  });

  it('translates approval.approve in English', () => {
    expect(i18n.t('approve', { ns: 'approval' })).toBe('Approve');
  });

  it('switches to zh-CN', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('save', { ns: 'common' })).toBe('保存');
    expect(i18n.t('approve', { ns: 'approval' })).toBe('批准');
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/frontend && pnpm test -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Create zh-CN locale files**

```json
// packages/frontend/src/i18n/locales/zh-CN/common.json
{
  "save": "保存",
  "cancel": "取消",
  "confirm": "确认",
  "loading": "加载中…",
  "error": "出错了",
  "retry": "重试",
  "back": "返回",
  "next": "下一步",
  "create": "创建",
  "delete": "删除",
  "edit": "编辑",
  "view": "查看",
  "close": "关闭",
  "search": "搜索",
  "settings": "设置",
  "logout": "退出登录",
  "language": "语言",
  "unknown_error": "未知错误"
}
```

```json
// packages/frontend/src/i18n/locales/zh-CN/workflow.json
{
  "workspace": "工作区",
  "workflow": "工作流",
  "run": "运行",
  "step": "步骤",
  "status": {
    "pending": "待开始",
    "running": "运行中",
    "completed": "已完成",
    "failed": "失败",
    "timed_out": "已超时",
    "retrying": "重试中",
    "cancelled": "已取消",
    "human_owned": "人工接管中"
  },
  "agent_role": {
    "planner": "规划 Agent",
    "tasker": "拆解 Agent",
    "coder": "编码 Agent",
    "tester": "测试 Agent",
    "reviewer": "审查 Agent",
    "summarizer": "摘要 Agent"
  },
  "artifact": "制品",
  "audit_trail": "审计日志",
  "agent_running": "Agent 运行中",
  "may_not_respond": "可能无响应",
  "no_runner": "无 Runner 在线",
  "runner_connected": "Runner 已连接"
}
```

```json
// packages/frontend/src/i18n/locales/zh-CN/approval.json
{
  "approve": "批准",
  "reject": "拒绝",
  "request_changes": "要求修改",
  "edit_output": "编辑输出",
  "take_over": "人工接管",
  "rerun_step": "重跑步骤",
  "approve_plan": "批准计划",
  "decision_submitted": "决策已提交",
  "changes_requested": "修改请求已提交，Agent 将重新执行",
  "take_over_instructions": "接管指南",
  "take_over_branch": "本地分支",
  "take_over_hint": "在本地 IDE 中切换到上述分支，完成修改后推送，AWW 将自动检测并恢复工作流",
  "finding_selector_title": "选择问题范围",
  "finding_selector_placeholder": "描述需要修改的问题…",
  "submit_changes": "提交修改请求"
}
```

```json
// packages/frontend/src/i18n/locales/zh-CN/errors.json
{
  "network_error": "网络错误，请检查连接",
  "unauthorized": "登录已过期，请重新登录",
  "forbidden": "无权执行此操作",
  "not_found": "资源不存在",
  "server_error": "服务器错误，请稍后重试",
  "runner_offline": "Runner 不在线，无法执行 Agent 任务",
  "sse_disconnected": "实时连接已断开，正在重连…"
}
```

- [ ] **Step 4: Create en locale files**

```json
// packages/frontend/src/i18n/locales/en/common.json
{
  "save": "Save",
  "cancel": "Cancel",
  "confirm": "Confirm",
  "loading": "Loading…",
  "error": "Error",
  "retry": "Retry",
  "back": "Back",
  "next": "Next",
  "create": "Create",
  "delete": "Delete",
  "edit": "Edit",
  "view": "View",
  "close": "Close",
  "search": "Search",
  "settings": "Settings",
  "logout": "Log out",
  "language": "Language",
  "unknown_error": "Unknown error"
}
```

```json
// packages/frontend/src/i18n/locales/en/workflow.json
{
  "workspace": "Workspace",
  "workflow": "Workflow",
  "run": "Run",
  "step": "Step",
  "status": {
    "pending": "Pending",
    "running": "Running",
    "completed": "Completed",
    "failed": "Failed",
    "timed_out": "Timed Out",
    "retrying": "Retrying",
    "cancelled": "Cancelled",
    "human_owned": "Human Takeover"
  },
  "agent_role": {
    "planner": "Planner Agent",
    "tasker": "Task Breakdown Agent",
    "coder": "Coding Agent",
    "tester": "Test Agent",
    "reviewer": "Review Agent",
    "summarizer": "Summarizer Agent"
  },
  "artifact": "Artifact",
  "audit_trail": "Audit Trail",
  "agent_running": "Agent Running",
  "may_not_respond": "May not respond",
  "no_runner": "No Runner online",
  "runner_connected": "Runner connected"
}
```

```json
// packages/frontend/src/i18n/locales/en/approval.json
{
  "approve": "Approve",
  "reject": "Reject",
  "request_changes": "Request Changes",
  "edit_output": "Edit Output",
  "take_over": "Take Over",
  "rerun_step": "Rerun Step",
  "approve_plan": "Approve Plan",
  "decision_submitted": "Decision submitted",
  "changes_requested": "Changes requested. Agent will re-run.",
  "take_over_instructions": "Takeover Instructions",
  "take_over_branch": "Local branch",
  "take_over_hint": "Switch to the branch above in your local IDE, make your changes, then push. AWW will detect the new commit and resume the workflow.",
  "finding_selector_title": "Select Issue Scope",
  "finding_selector_placeholder": "Describe the issue to fix…",
  "submit_changes": "Submit Change Request"
}
```

```json
// packages/frontend/src/i18n/locales/en/errors.json
{
  "network_error": "Network error. Please check your connection.",
  "unauthorized": "Session expired. Please log in again.",
  "forbidden": "You don't have permission to do this.",
  "not_found": "Resource not found.",
  "server_error": "Server error. Please try again later.",
  "runner_offline": "Runner is offline. Cannot execute agent tasks.",
  "sse_disconnected": "Real-time connection lost. Reconnecting…"
}
```

- [ ] **Step 5: Implement i18n/index.ts**

```typescript
// packages/frontend/src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCommon from './locales/zh-CN/common.json';
import zhWorkflow from './locales/zh-CN/workflow.json';
import zhApproval from './locales/zh-CN/approval.json';
import zhErrors from './locales/zh-CN/errors.json';
import enCommon from './locales/en/common.json';
import enWorkflow from './locales/en/workflow.json';
import enApproval from './locales/en/approval.json';
import enErrors from './locales/en/errors.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { common: zhCommon, workflow: zhWorkflow, approval: zhApproval, errors: zhErrors },
      en: { common: enCommon, workflow: enWorkflow, approval: enApproval, errors: enErrors },
    },
    fallbackLng: 'zh-CN',
    defaultNS: 'common',
    ns: ['common', 'workflow', 'approval', 'errors'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'aww-lang',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
```

- [ ] **Step 6: Run — must PASS**

```bash
cd packages/frontend && pnpm test -- --reporter=verbose
```

- [ ] **Step 7: Implement LanguageToggle.tsx**

```tsx
// packages/frontend/src/components/common/LanguageToggle.tsx
import { useTranslation } from 'react-i18next';

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const isZh = i18n.language === 'zh-CN';

  const toggle = () => {
    const next = isZh ? 'en' : 'zh-CN';
    i18n.changeLanguage(next);
    localStorage.setItem('aww-lang', next);
  };

  return (
    <button
      onClick={toggle}
      className="text-xs font-medium px-2 py-1 rounded border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition-colors"
      title={isZh ? 'Switch to English' : '切换为中文'}
    >
      {isZh ? 'EN' : '中'}
    </button>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/i18n packages/frontend/src/components/common/LanguageToggle.tsx packages/frontend/test/i18n.test.ts
git commit -m "feat(frontend): i18n setup — zh-CN/en namespaced locales + LanguageToggle"
```

---

## Task 3: API Client + TanStack Query + Stores

**Files:**
- Create: `packages/frontend/src/lib/api-client.ts`
- Create: `packages/frontend/src/lib/query-client.ts`
- Create: `packages/frontend/src/stores/auth.store.ts`
- Create: `packages/frontend/src/stores/sse.store.ts`
- Create: `packages/frontend/src/stores/ui.store.ts`

- [ ] **Step 1: Write failing test for API client**

```typescript
// packages/frontend/test/lib/api-client.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server.js';
import { createApiClient } from '../../src/lib/api-client.js';

describe('ApiClient', () => {
  const client = createApiClient({ baseUrl: '' });

  it('GET returns parsed data', async () => {
    server.use(http.get('/api/v1/workspaces', () => HttpResponse.json({ data: [{ id: 'ws_1' }] })));
    const result = await client.get<Array<{ id: string }>>('/api/v1/workspaces');
    expect(result[0].id).toBe('ws_1');
  });

  it('POST sends JSON body', async () => {
    let body: unknown;
    server.use(http.post('/api/v1/workspaces', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ data: { id: 'ws_new' } });
    }));
    await client.post('/api/v1/workspaces', { name: 'Test WS' });
    expect((body as { name: string }).name).toBe('Test WS');
  });

  it('throws ApiError on 401', async () => {
    server.use(http.get('/api/v1/workspaces', () => HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })));
    await expect(client.get('/api/v1/workspaces')).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 2: Create MSW mock server**

```typescript
// packages/frontend/test/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers.js';
export const server = setupServer(...handlers);
```

```typescript
// packages/frontend/test/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
export const handlers = [
  http.get('/api/v1/workspaces', () => HttpResponse.json({ data: [] })),
];
```

```typescript
// packages/frontend/test/setup.ts
import '@testing-library/jest-dom';
import { server } from './mocks/server.js';
import { beforeAll, afterAll, afterEach } from 'vitest';
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 3: Run — must FAIL**

```bash
cd packages/frontend && pnpm test lib/api-client -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 4: Implement api-client.ts**

```typescript
// packages/frontend/src/lib/api-client.ts
export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete(path: string): Promise<void>;
}

export function createApiClient(opts: { baseUrl: string; getToken?: () => string | null }): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = opts.getToken?.();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${opts.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;

    const json = await res.json() as { data?: T; error?: string };
    if (!res.ok) throw new ApiError(res.status, json, json.error ?? `HTTP ${res.status}`);
    return json.data as T;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path).then(() => undefined),
  };
}

// Singleton with auth token injection — configured in auth.store
let _client: ApiClient | null = null;
export function getApiClient(): ApiClient {
  if (!_client) _client = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE ?? '' });
  return _client;
}
export function setApiClientFactory(factory: () => ApiClient): void {
  _client = factory();
}
```

- [ ] **Step 5: Implement query-client.ts**

```typescript
// packages/frontend/src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});
```

- [ ] **Step 6: Implement stores**

```typescript
// packages/frontend/src/stores/auth.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User { id: string; name: string; email: string; preferred_language: 'zh-CN' | 'en' }

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
    }),
    { name: 'aww-auth' }
  )
);
```

```typescript
// packages/frontend/src/stores/sse.store.ts
import { create } from 'zustand';

type SSEStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error';

interface SSEState {
  status: SSEStatus;
  lastEventId: string | null;
  setStatus: (status: SSEStatus) => void;
  setLastEventId: (id: string) => void;
}

export const useSSEStore = create<SSEState>()((set) => ({
  status: 'idle',
  lastEventId: null,
  setStatus: (status) => set({ status }),
  setLastEventId: (lastEventId) => set({ lastEventId }),
}));
```

```typescript
// packages/frontend/src/stores/ui.store.ts
import { create } from 'zustand';

interface UIState {
  selectedStepId: string | null;
  selectedArtifactId: string | null;
  isFindingSelOpen: boolean;
  isTakeOverModalOpen: boolean;
  selectStep: (id: string | null) => void;
  selectArtifact: (id: string | null) => void;
  openFindingSel: () => void;
  closeFindingSel: () => void;
  openTakeOverModal: () => void;
  closeTakeOverModal: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  selectedStepId: null,
  selectedArtifactId: null,
  isFindingSelOpen: false,
  isTakeOverModalOpen: false,
  selectStep: (selectedStepId) => set({ selectedStepId }),
  selectArtifact: (selectedArtifactId) => set({ selectedArtifactId }),
  openFindingSel: () => set({ isFindingSelOpen: true }),
  closeFindingSel: () => set({ isFindingSelOpen: false }),
  openTakeOverModal: () => set({ isTakeOverModalOpen: true }),
  closeTakeOverModal: () => set({ isTakeOverModalOpen: false }),
}));
```

- [ ] **Step 7: Run — must PASS**

```bash
cd packages/frontend && pnpm test -- --reporter=verbose
```

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/lib packages/frontend/src/stores packages/frontend/test
git commit -m "feat(frontend): API client + TanStack QueryClient + Zustand stores (auth/sse/ui)"
```

---

## Task 4: SSE Hook + Router + Layout

**Files:**
- Create: `packages/frontend/src/hooks/useSSEConnection.ts`
- Create: `packages/frontend/src/router/index.tsx`
- Create: `packages/frontend/src/layout/AppShell.tsx`
- Create: `packages/frontend/src/layout/WorkspaceLayout.tsx`

- [ ] **Step 1: Write failing test for SSE hook**

```typescript
// packages/frontend/test/hooks/useSSEConnection.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSSEStore } from '../../src/stores/sse.store.js';
import { useSSEConnection } from '../../src/hooks/useSSEConnection.js';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  listeners = new Map<string, (e: MessageEvent) => void>();
  closed = false;

  constructor(public url: string) { MockEventSource.instances.push(this); }
  addEventListener(type: string, fn: (e: MessageEvent) => void) { this.listeners.set(type, fn); }
  close() { this.closed = true; }

  simulateOpen() { this.onopen?.(); }
  simulateEvent(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

vi.stubGlobal('EventSource', MockEventSource);

afterEach(() => { MockEventSource.instances.length = 0; vi.useRealTimers(); });

describe('useSSEConnection', () => {
  it('sets status to connecting on mount', () => {
    renderHook(() => useSSEConnection('ws_1', 'token_abc'));
    expect(useSSEStore.getState().status).toBe('connecting');
  });

  it('sets status to open on EventSource open', async () => {
    renderHook(() => useSSEConnection('ws_1', 'token_abc'));
    act(() => { MockEventSource.instances[0]?.simulateOpen(); });
    expect(useSSEStore.getState().status).toBe('open');
  });

  it('closes EventSource on unmount', () => {
    const { unmount } = renderHook(() => useSSEConnection('ws_1', 'token_abc'));
    unmount();
    expect(MockEventSource.instances[0]?.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/frontend && pnpm test hooks/useSSEConnection -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement useSSEConnection.ts**

```typescript
// packages/frontend/src/hooks/useSSEConnection.ts
import { useEffect, useRef } from 'react';
import { useSSEStore } from '../stores/sse.store.js';
import { queryClient } from '../lib/query-client.js';

export function useSSEConnection(workspaceId: string, token: string | null): void {
  const setStatus = useSSEStore((s) => s.setStatus);
  const setLastEventId = useSSEStore((s) => s.setLastEventId);
  const lastEventId = useSSEStore((s) => s.lastEventId);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!token || !workspaceId) return;
    setStatus('connecting');

    const url = `/api/v1/workspaces/${workspaceId}/events?token=${encodeURIComponent(token)}`
      + (lastEventId ? `&lastEventId=${lastEventId}` : '');

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setStatus('open');
    es.onerror = () => setStatus('reconnecting');

    const handleEvent = (e: MessageEvent) => {
      if (e.lastEventId) setLastEventId(e.lastEventId);
      try {
        const payload = JSON.parse(e.data as string) as { event_type: string; run_id?: string; step_id?: string };
        if (payload.event_type === 'step.status_changed' && payload.step_id) {
          queryClient.invalidateQueries({ queryKey: ['run', payload.run_id, 'steps'] });
        }
        if (payload.event_type === 'artifact.created' && payload.run_id) {
          queryClient.invalidateQueries({ queryKey: ['run', payload.run_id, 'artifacts'] });
        }
        if (payload.event_type === 'agent_run.started' || payload.event_type === 'agent_run.completed') {
          queryClient.invalidateQueries({ queryKey: ['run', payload.run_id] });
        }
      } catch {}
    };

    ['step.status_changed', 'artifact.created', 'agent_run.started', 'agent_run.completed', 'agent_run.failed'].forEach(
      (t) => es.addEventListener(t, handleEvent)
    );

    return () => { es.close(); setStatus('idle'); };
  }, [workspaceId, token]);
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/frontend && pnpm test hooks/useSSEConnection -- --reporter=verbose
```

- [ ] **Step 5: Implement router/index.tsx**

```tsx
// packages/frontend/src/router/index.tsx
import { createBrowserRouter, redirect } from 'react-router-dom';
import { AppShell } from '../layout/AppShell.js';
import { WorkspaceLayout } from '../layout/WorkspaceLayout.js';
import { useAuthStore } from '../stores/auth.store.js';

// Lazy imports for code splitting
const LoginPage = () => import('../pages/LoginPage.js').then((m) => ({ default: m.LoginPage }));
const OAuthCallbackPage = () => import('../pages/OAuthCallbackPage.js').then((m) => ({ default: m.OAuthCallbackPage }));
const WorkspacesPage = () => import('../pages/WorkspacesPage.js').then((m) => ({ default: m.WorkspacesPage }));
const WorkspaceOverviewPage = () => import('../pages/WorkspaceOverviewPage.js').then((m) => ({ default: m.WorkspaceOverviewPage }));
const RunDetailPage = () => import('../pages/RunDetailPage.js').then((m) => ({ default: m.RunDetailPage }));
const RunnerMgmtPage = () => import('../pages/RunnerMgmtPage.js').then((m) => ({ default: m.RunnerMgmtPage }));
const SettingsPage = () => import('../pages/SettingsPage.js').then((m) => ({ default: m.SettingsPage }));

function requireAuth() {
  const token = useAuthStore.getState().token;
  if (!token) throw redirect('/login');
  return null;
}

export const router = createBrowserRouter([
  { path: '/login', lazy: LoginPage },
  { path: '/oauth/callback', lazy: OAuthCallbackPage },
  {
    path: '/',
    loader: requireAuth,
    element: <AppShell />,
    children: [
      { index: true, loader: () => redirect('/workspaces') },
      { path: 'workspaces', lazy: WorkspacesPage },
      {
        path: 'w/:workspaceSlug',
        element: <WorkspaceLayout />,
        children: [
          { index: true, lazy: WorkspaceOverviewPage },
          { path: 'runs/:runId', lazy: RunDetailPage },
          { path: 'runners', lazy: RunnerMgmtPage },
          { path: 'settings', lazy: SettingsPage },
        ],
      },
    ],
  },
]);
```

- [ ] **Step 6: Implement AppShell.tsx**

```tsx
// packages/frontend/src/layout/AppShell.tsx
import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '../components/common/LanguageToggle.js';

const NAV_ITEMS = [
  { icon: '⬡', label: 'Workspaces', to: '/workspaces' },
  { icon: '⚙', label: 'Settings', to: '/settings/account' },
];

export function AppShell() {
  const { t } = useTranslation('common');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', height: '100vh', background: 'var(--bg)' }}>
      {/* Left nav rail */}
      <nav style={{ background: 'var(--surface)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--blue)', marginBottom: 16 }}>A</div>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} title={t(item.label.toLowerCase())} style={{ color: 'var(--muted)', fontSize: 20, padding: '8px' }}>
            {item.icon}
          </NavLink>
        ))}
        <div style={{ marginTop: 'auto' }}>
          <LanguageToggle />
        </div>
      </nav>

      {/* Content area */}
      <main style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Implement WorkspaceLayout.tsx**

```tsx
// packages/frontend/src/layout/WorkspaceLayout.tsx
import { Outlet, useParams } from 'react-router-dom';
import { useSSEConnection } from '../hooks/useSSEConnection.js';
import { useAuthStore } from '../stores/auth.store.js';

export function WorkspaceLayout() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const token = useAuthStore((s) => s.token);

  useSSEConnection(workspaceSlug ?? '', token);

  return <Outlet />;
}
```

- [ ] **Step 8: Run all tests**

```bash
cd packages/frontend && pnpm test -- --reporter=verbose
```

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/src/hooks packages/frontend/src/router packages/frontend/src/layout
git commit -m "feat(frontend): SSE hook + React Router v6 + AppShell + WorkspaceLayout"
```

---

## Task 5: Data Hooks (TanStack Query)

**Files:**
- Create: `packages/frontend/src/hooks/useWorkspace.ts`
- Create: `packages/frontend/src/hooks/useRun.ts`
- Create: `packages/frontend/src/hooks/useArtifact.ts`
- Create: `packages/frontend/src/hooks/useDecision.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/frontend/test/hooks/useDecision.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server.js';
import { createWrapper } from '../helpers/wrapper.js';
import { useSubmitDecision } from '../../src/hooks/useDecision.js';

describe('useSubmitDecision', () => {
  it('calls POST /steps/:id/decision and returns success', async () => {
    server.use(
      http.post('/api/v1/steps/s_1/decision', () =>
        HttpResponse.json({ data: { id: 'd_1', action: 'approve' } })
      )
    );
    const { result } = renderHook(() => useSubmitDecision(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ stepId: 's_1', action: 'approve' });
    });
    expect(result.current.isSuccess).toBe(true);
  });
});
```

```typescript
// packages/frontend/test/helpers/wrapper.tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

export function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/frontend && pnpm test hooks/useDecision -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement hooks**

```typescript
// packages/frontend/src/hooks/useWorkspace.ts
import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export interface Workspace { id: string; name: string; slug: string; github_repo?: string }

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: ['workspace', id],
    queryFn: () => getApiClient().get<Workspace>(`/api/v1/workspaces/${id}`),
    enabled: Boolean(id),
  });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => getApiClient().get<Workspace[]>('/api/v1/workspaces'),
  });
}
```

```typescript
// packages/frontend/src/hooks/useRun.ts
import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export interface WorkflowStep {
  id: string;
  position: number;
  name: string;
  status: string;
  owner_type: 'human' | 'agent' | 'approval_gate';
  agent_role?: string;
  output_artifact_ids: string[];
}

export interface WorkflowRun {
  id: string;
  workspace_id: string;
  status: string;
  feature_branch?: string;
  steps: WorkflowStep[];
}

export function useRun(runId: string) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => getApiClient().get<WorkflowRun>(`/api/v1/runs/${runId}`),
    enabled: Boolean(runId),
  });
}
```

```typescript
// packages/frontend/src/hooks/useArtifact.ts
import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export interface Artifact { id: string; role: string; status: string; content_inline?: string; version: number }

export function useArtifact(artifactId: string) {
  return useQuery({
    queryKey: ['artifact', artifactId],
    queryFn: () => getApiClient().get<Artifact>(`/api/v1/artifacts/${artifactId}`),
    enabled: Boolean(artifactId),
  });
}
```

```typescript
// packages/frontend/src/hooks/useDecision.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export type DecisionAction = 'approve' | 'reject' | 'request_changes' | 'edit' | 'take_over';

interface SubmitDecisionInput {
  stepId: string;
  action: DecisionAction;
  comment?: string;
  edited_artifact_id?: string;
}

export function useSubmitDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stepId, ...body }: SubmitDecisionInput) =>
      getApiClient().post(`/api/v1/steps/${stepId}/decision`, body),
    onSuccess: (_data, { stepId }) => {
      qc.invalidateQueries({ queryKey: ['step', stepId] });
    },
  });
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/frontend && pnpm test -- --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/hooks packages/frontend/test/hooks packages/frontend/test/helpers
git commit -m "feat(frontend): TanStack Query hooks — useWorkspace, useRun, useArtifact, useSubmitDecision"
```

---

## Task 6: Core UI Primitives

**Files:**
- Create: `packages/frontend/src/components/ui/Button.tsx`
- Create: `packages/frontend/src/components/ui/Badge.tsx`
- Create: `packages/frontend/src/components/ui/Toast.tsx`
- Create: `packages/frontend/src/components/common/StatusPill.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/frontend/test/components/Button.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../../src/components/ui/Button.js';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('applies danger variant class', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('danger');
  });

  it('is disabled when disabled prop set', () => {
    render(<Button disabled>Action</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/frontend && pnpm test components/Button -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement Button.tsx**

```tsx
// packages/frontend/src/components/ui/Button.tsx
import { type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

const VARIANTS: Record<string, string> = {
  primary: 'bg-[var(--blue)] text-white hover:opacity-90',
  secondary: 'border border-[var(--line)] text-[var(--ink)] hover:border-[var(--line-strong)]',
  danger: 'danger border border-[var(--red)] text-[var(--red)] hover:bg-[var(--red)] hover:text-white',
  ghost: 'text-[var(--muted)] hover:text-[var(--ink)]',
};

const SIZES: Record<string, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

export function Button({ variant = 'secondary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Implement Badge.tsx, StatusPill.tsx, Toast.tsx**

```tsx
// packages/frontend/src/components/ui/Badge.tsx
interface BadgeProps { children: React.ReactNode; color?: 'green' | 'amber' | 'red' | 'teal' | 'violet' | 'muted' }
export function Badge({ children, color = 'muted' }: BadgeProps) {
  const colors: Record<string, string> = {
    green: 'bg-green-900/30 text-green-400', amber: 'bg-amber-900/30 text-amber-400',
    red: 'bg-red-900/30 text-red-400', teal: 'bg-teal-900/30 text-teal-400',
    violet: 'bg-violet-900/30 text-violet-400', muted: 'bg-gray-800 text-gray-400',
  };
  return <span className={`text-xs px-1.5 py-0.5 rounded ${colors[color]}`}>{children}</span>;
}
```

```tsx
// packages/frontend/src/components/common/StatusPill.tsx
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge.js';

const STATUS_COLOR: Record<string, 'green' | 'amber' | 'red' | 'teal' | 'violet' | 'muted'> = {
  completed: 'green', running: 'amber', failed: 'red', timed_out: 'red',
  retrying: 'amber', human_owned: 'violet', pending: 'muted', cancelled: 'muted',
};

export function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation('workflow');
  return <Badge color={STATUS_COLOR[status] ?? 'muted'}>{t(`status.${status}`, { defaultValue: status })}</Badge>;
}
```

```tsx
// packages/frontend/src/components/ui/Toast.tsx
import { useState, useCallback } from 'react';

interface ToastItem { id: number; message: string; type: 'success' | 'error' | 'info' }
let _show: ((msg: string, type?: ToastItem['type']) => void) | null = null;

export function showToast(msg: string, type: ToastItem['type'] = 'success') { _show?.(msg, type); }

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  _show = show;

  const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--blue)' };
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ background: 'var(--surface)', border: `1px solid ${colors[t.type]}`, borderRadius: 8, padding: '8px 16px', color: 'var(--ink)', fontSize: 14 }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run — must PASS**

```bash
cd packages/frontend && pnpm test -- --reporter=verbose
```

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components packages/frontend/test/components
git commit -m "feat(frontend): UI primitives — Button, Badge, Toast, StatusPill"
```

---

## Task 7: Onboarding — EmptyState + FTUEWizard

**Files:**
- Create: `packages/frontend/src/features/onboarding/EmptyState.tsx`
- Create: `packages/frontend/src/features/onboarding/FTUEWizard.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// packages/frontend/test/components/FTUEWizard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../src/i18n/index.js';
import { FTUEWizard } from '../../src/features/onboarding/FTUEWizard.js';

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('FTUEWizard', () => {
  it('shows step 1 initially', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<FTUEWizard onComplete={vi.fn()} />);
    expect(screen.getByPlaceholderText(/workspace name/i)).toBeTruthy();
  });

  it('disables Next when workspace name empty on step 1', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<FTUEWizard onComplete={vi.fn()} />);
    const nextBtn = screen.getAllByRole('button').find((b) => b.textContent === 'Next');
    expect(nextBtn).toBeDisabled();
  });

  it('enables Next after typing workspace name', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<FTUEWizard onComplete={vi.fn()} />);
    const input = screen.getByPlaceholderText(/workspace name/i);
    fireEvent.change(input, { target: { value: 'My Project' } });
    const nextBtn = screen.getAllByRole('button').find((b) => b.textContent === 'Next');
    expect(nextBtn).not.toBeDisabled();
  });

  it('calls onComplete on final step submit', async () => {
    await i18n.changeLanguage('en');
    const onComplete = vi.fn();
    renderWithI18n(<FTUEWizard onComplete={onComplete} />);
    // step 1: name
    fireEvent.change(screen.getByPlaceholderText(/workspace name/i), { target: { value: 'My Project' } });
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === 'Next')!);
    // step 2: github (optional)
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === 'Next')!);
    // step 3: prd - fill and submit
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Some PRD content' } });
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Create'))!);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ name: 'My Project' }));
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/frontend && pnpm test components/FTUEWizard -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement EmptyState.tsx**

```tsx
// packages/frontend/src/features/onboarding/EmptyState.tsx
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';

interface EmptyStateProps { onStart: () => void }

export function EmptyState({ onStart }: EmptyStateProps) {
  const { t } = useTranslation('common');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
      <div style={{ fontSize: 48 }}>⬡</div>
      <h2 style={{ color: 'var(--ink)', margin: 0 }}>AWW</h2>
      <p style={{ color: 'var(--muted)', textAlign: 'center', maxWidth: 320 }}>
        {t('empty_state_hint', { defaultValue: 'Create your first workspace to start an AI-powered workflow' })}
      </p>
      <Button variant="primary" onClick={onStart}>{t('create')} Workspace</Button>
    </div>
  );
}
```

- [ ] **Step 4: Implement FTUEWizard.tsx (3-step)**

```tsx
// packages/frontend/src/features/onboarding/FTUEWizard.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';

interface WizardData { name: string; github_repo: string; prd: string }
interface FTUEWizardProps { onComplete: (data: WizardData) => void }

export function FTUEWizard({ onComplete }: FTUEWizardProps) {
  const { t } = useTranslation('common');
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({ name: '', github_repo: '', prd: '' });

  const canNext = step === 1 ? data.name.trim().length > 0
    : step === 2 ? true
    : data.prd.trim().length > 0;

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else onComplete(data);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24, maxWidth: 480 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {[1, 2, 3].map((s) => (
          <div key={s} style={{ height: 4, flex: 1, borderRadius: 2, background: s <= step ? 'var(--blue)' : 'var(--line)' }} />
        ))}
      </div>

      {step === 1 && (
        <>
          <h3 style={{ color: 'var(--ink)', margin: 0 }}>Workspace Name</h3>
          <input
            placeholder="Workspace name"
            value={data.name}
            onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, padding: '8px 12px', color: 'var(--ink)', fontSize: 14, outline: 'none' }}
          />
        </>
      )}

      {step === 2 && (
        <>
          <h3 style={{ color: 'var(--ink)', margin: 0 }}>GitHub Repository (optional)</h3>
          <input
            placeholder="owner/repo"
            value={data.github_repo}
            onChange={(e) => setData((d) => ({ ...d, github_repo: e.target.value }))}
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, padding: '8px 12px', color: 'var(--ink)', fontSize: 14, outline: 'none' }}
          />
        </>
      )}

      {step === 3 && (
        <>
          <h3 style={{ color: 'var(--ink)', margin: 0 }}>Paste your PRD</h3>
          <textarea
            value={data.prd}
            onChange={(e) => setData((d) => ({ ...d, prd: e.target.value }))}
            rows={8}
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, padding: '8px 12px', color: 'var(--ink)', fontSize: 14, outline: 'none', resize: 'vertical' }}
          />
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {step > 1 && <Button onClick={() => setStep(step - 1)}>{t('back')}</Button>}
        <Button variant="primary" disabled={!canNext} onClick={handleNext}>
          {step === 3 ? `${t('create')} Workspace` : t('next')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run — must PASS**

```bash
cd packages/frontend && pnpm test components/FTUEWizard -- --reporter=verbose
```

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/features/onboarding packages/frontend/test/components/FTUEWizard.test.tsx
git commit -m "feat(frontend): EmptyState + FTUEWizard 3-step onboarding"
```

---

## Task 8: AgentBanner (90s countdown)

**Files:**
- Create: `packages/frontend/src/features/workflow-run/AgentBanner.tsx`
- Create: `packages/frontend/test/components/AgentBanner.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// packages/frontend/test/components/AgentBanner.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../src/i18n/index.js';
import { AgentBanner } from '../../src/features/workflow-run/AgentBanner.js';

afterEach(() => vi.useRealTimers());

function wrap(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('AgentBanner', () => {
  it('shows agent role label', async () => {
    await i18n.changeLanguage('en');
    wrap(<AgentBanner agentRole="planner" startedAt={new Date()} />);
    expect(screen.getByText(/Planner Agent/i)).toBeTruthy();
  });

  it('shows warning badge after 90s', async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage('en');
    wrap(<AgentBanner agentRole="coder" startedAt={new Date()} />);
    act(() => { vi.advanceTimersByTime(91_000); });
    expect(screen.getByText(/May not respond/i)).toBeTruthy();
  });

  it('does not show warning badge before 90s', async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage('en');
    wrap(<AgentBanner agentRole="coder" startedAt={new Date()} />);
    act(() => { vi.advanceTimersByTime(80_000); });
    expect(screen.queryByText(/May not respond/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/frontend && pnpm test components/AgentBanner -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement AgentBanner.tsx**

```tsx
// packages/frontend/src/features/workflow-run/AgentBanner.tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface AgentBannerProps { agentRole: string; startedAt: Date }

const WARN_THRESHOLD = 90;

export function AgentBanner({ agentRole, startedAt }: AgentBannerProps) {
  const { t } = useTranslation('workflow');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const roleLabel = t(`agent_role.${agentRole}`, { defaultValue: agentRole });
  const remaining = Math.max(0, WARN_THRESHOLD - elapsed);
  const overdue = elapsed >= WARN_THRESHOLD;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--line)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', animation: 'pulse 1s infinite' }} />
      <span style={{ fontSize: 13, color: 'var(--ink)' }}>{roleLabel}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('agent_running')}</span>
      {!overdue && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{remaining}s</span>}
      {overdue && (
        <span style={{ fontSize: 11, color: 'var(--amber)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          ⚠ {t('may_not_respond')}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/frontend && pnpm test components/AgentBanner -- --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/features/workflow-run/AgentBanner.tsx packages/frontend/test/components/AgentBanner.test.tsx
git commit -m "feat(frontend): AgentBanner with 90s countdown and ⚠ overdue warning"
```

---

## Task 9: ApprovalActionBar + FindingSel

**Files:**
- Create: `packages/frontend/src/features/approval/ApprovalActionBar.tsx`
- Create: `packages/frontend/src/features/finding/FindingSel.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// packages/frontend/test/components/ApprovalActionBar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../src/i18n/index.js';
import { ApprovalActionBar } from '../../src/features/approval/ApprovalActionBar.js';

function wrap(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('ApprovalActionBar', () => {
  it('renders all 5 action buttons', async () => {
    await i18n.changeLanguage('en');
    const onDecision = vi.fn();
    wrap(<ApprovalActionBar stepId="s_1" onDecision={onDecision} />);
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
    expect(screen.getByText('Request Changes')).toBeTruthy();
    expect(screen.getByText('Edit Output')).toBeTruthy();
    expect(screen.getByText('Take Over')).toBeTruthy();
  });

  it('calls onDecision with approve action', async () => {
    await i18n.changeLanguage('en');
    const onDecision = vi.fn();
    wrap(<ApprovalActionBar stepId="s_1" onDecision={onDecision} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(onDecision).toHaveBeenCalledWith({ action: 'approve' });
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/frontend && pnpm test components/ApprovalActionBar -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement ApprovalActionBar.tsx**

```tsx
// packages/frontend/src/features/approval/ApprovalActionBar.tsx
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';
import { useUIStore } from '../../stores/ui.store.js';
import type { DecisionAction } from '../../hooks/useDecision.js';

interface ApprovalActionBarProps {
  stepId: string;
  onDecision: (opts: { action: DecisionAction; comment?: string }) => void;
}

export function ApprovalActionBar({ stepId: _stepId, onDecision }: ApprovalActionBarProps) {
  const { t } = useTranslation('approval');
  const openFindingSel = useUIStore((s) => s.openFindingSel);
  const openTakeOverModal = useUIStore((s) => s.openTakeOverModal);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      <Button variant="primary" style={{ gridColumn: '1 / -1' }} onClick={() => onDecision({ action: 'approve' })}>
        {t('approve')}
      </Button>
      <Button onClick={() => openFindingSel()}>{t('request_changes')}</Button>
      <Button onClick={() => onDecision({ action: 'edit' })}>{t('edit_output')}</Button>
      <Button onClick={() => openTakeOverModal()}>{t('take_over')}</Button>
      <Button variant="danger" onClick={() => onDecision({ action: 'reject' })}>{t('reject')}</Button>
    </div>
  );
}
```

- [ ] **Step 4: Implement FindingSel.tsx**

```tsx
// packages/frontend/src/features/finding/FindingSel.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/ui.store.js';
import { Button } from '../../components/ui/Button.js';
import { showToast } from '../../components/ui/Toast.js';

interface FindingSelProps { onSubmit: (comment: string) => void }

export function FindingSel({ onSubmit }: FindingSelProps) {
  const { t } = useTranslation('approval');
  const isOpen = useUIStore((s) => s.isFindingSelOpen);
  const closeFindingSel = useUIStore((s) => s.closeFindingSel);
  const [comment, setComment] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSubmit(comment);
    closeFindingSel();
    setComment('');
    showToast(t('changes_requested'));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', borderRadius: '12px 12px 0 0', padding: 24, width: '100%', maxWidth: 600, margin: '0 auto' }}>
        <h3 style={{ color: 'var(--ink)', margin: '0 0 12px' }}>{t('finding_selector_title')}</h3>
        <textarea
          placeholder={t('finding_selector_placeholder')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          style={{ width: '100%', background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', color: 'var(--ink)', fontSize: 14, resize: 'none', outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <Button onClick={closeFindingSel}>Cancel</Button>
          <Button variant="primary" disabled={!comment.trim()} onClick={handleSubmit}>{t('submit_changes')}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run — must PASS**

```bash
cd packages/frontend && pnpm test -- --reporter=verbose
```

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/features/approval packages/frontend/src/features/finding packages/frontend/test/components/ApprovalActionBar.test.tsx
git commit -m "feat(frontend): ApprovalActionBar (5 actions) + FindingSel drawer"
```

---

## Task 10: WorkflowTimeline + RunDetailPage

**Files:**
- Create: `packages/frontend/src/features/workflow-run/WorkflowTimeline.tsx`
- Create: `packages/frontend/src/pages/RunDetailPage.tsx`

- [ ] **Step 1: Implement WorkflowTimeline.tsx**

```tsx
// packages/frontend/src/features/workflow-run/WorkflowTimeline.tsx
import { useTranslation } from 'react-i18next';
import { StatusPill } from '../../components/common/StatusPill.js';
import type { WorkflowStep } from '../../hooks/useRun.js';

interface WorkflowTimelineProps {
  steps: WorkflowStep[];
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}

const STATUS_ICON: Record<string, string> = {
  completed: '✓', running: '◉', pending: '○', failed: '✗',
  timed_out: '⏱', retrying: '↻', human_owned: '◈', cancelled: '—',
};

const OWNER_LABEL: Record<string, string> = {
  human: '👤', agent: '🤖', approval_gate: '🔒',
};

export function WorkflowTimeline({ steps, selectedStepId, onSelectStep }: WorkflowTimelineProps) {
  const { t } = useTranslation('workflow');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 8px', overflowY: 'auto' }}>
      {steps.map((step) => (
        <button
          key={step.id}
          onClick={() => onSelectStep(step.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6,
            background: selectedStepId === step.id ? 'var(--surface-soft)' : 'transparent',
            border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
          }}
        >
          <span style={{ fontSize: 14, color: 'var(--muted)', width: 16, textAlign: 'center' }}>{STATUS_ICON[step.status] ?? '○'}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{OWNER_LABEL[step.owner_type]}</span>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)', truncate: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{step.name}</span>
          <StatusPill status={step.status} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement RunDetailPage.tsx**

```tsx
// packages/frontend/src/pages/RunDetailPage.tsx
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRun } from '../hooks/useRun.js';
import { useUIStore } from '../stores/ui.store.js';
import { WorkflowTimeline } from '../features/workflow-run/WorkflowTimeline.js';
import { ApprovalActionBar } from '../features/approval/ApprovalActionBar.js';
import { FindingSel } from '../features/finding/FindingSel.js';
import { TakeOverModal } from '../features/take-over/TakeOverModal.js';
import { useSubmitDecision } from '../hooks/useDecision.js';
import { showToast } from '../components/ui/Toast.js';
import type { DecisionAction } from '../hooks/useDecision.js';

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const { t } = useTranslation(['common', 'approval']);
  const { data: run, isLoading } = useRun(runId ?? '');
  const selectedStepId = useUIStore((s) => s.selectedStepId);
  const selectStep = useUIStore((s) => s.selectStep);
  const { mutateAsync: submitDecision } = useSubmitDecision();

  const activeStep = run?.steps.find((s) => s.id === selectedStepId)
    ?? run?.steps.find((s) => s.status === 'running' || s.status === 'completed') ?? run?.steps[0];

  const handleDecision = async ({ action, comment }: { action: DecisionAction; comment?: string }) => {
    if (!activeStep) return;
    try {
      await submitDecision({ stepId: activeStep.id, action, comment });
      showToast(t('approval:decision_submitted'));
    } catch {
      showToast(t('common:error'), 'error');
    }
  };

  if (isLoading) return <div style={{ color: 'var(--muted)', padding: 24 }}>{t('common:loading')}</div>;
  if (!run) return <div style={{ color: 'var(--red)', padding: 24 }}>{t('common:error')}</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '288px 1fr 340px', height: '100%', overflow: 'hidden' }}>
      {/* Left: Workflow timeline */}
      <div style={{ borderRight: '1px solid var(--line)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)' }}>
          {t('workflow:workflow')} — {run.steps.length} steps
        </div>
        <WorkflowTimeline
          steps={run.steps}
          selectedStepId={selectedStepId}
          onSelectStep={selectStep}
        />
      </div>

      {/* Center: Step detail */}
      <div style={{ padding: 24, overflow: 'auto' }}>
        {activeStep && (
          <div>
            <h2 style={{ color: 'var(--ink)', margin: '0 0 8px' }}>{activeStep.name}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Status: {activeStep.status}</p>
          </div>
        )}
      </div>

      {/* Right: Approval panel */}
      <div style={{ borderLeft: '1px solid var(--line)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeStep?.owner_type === 'approval_gate' && (
          <ApprovalActionBar stepId={activeStep.id} onDecision={handleDecision} />
        )}
      </div>

      {/* Overlays */}
      <FindingSel onSubmit={(comment) => handleDecision({ action: 'request_changes', comment })} />
      <TakeOverModal stepId={activeStep?.id ?? ''} featureBranch={run.feature_branch ?? ''} />
    </div>
  );
}
```

- [ ] **Step 3: Implement TakeOverModal stub**

```tsx
// packages/frontend/src/features/take-over/TakeOverModal.tsx
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/ui.store.js';
import { Button } from '../../components/ui/Button.js';

interface TakeOverModalProps { stepId: string; featureBranch: string }

export function TakeOverModal({ stepId: _stepId, featureBranch }: TakeOverModalProps) {
  const { t } = useTranslation('approval');
  const isOpen = useUIStore((s) => s.isTakeOverModalOpen);
  const close = useUIStore((s) => s.closeTakeOverModal);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%' }}>
        <h3 style={{ color: 'var(--ink)', margin: '0 0 12px' }}>{t('take_over_instructions')}</h3>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{t('take_over_branch')}</div>
          <code style={{ background: 'var(--surface-soft)', padding: '4px 8px', borderRadius: 4, fontSize: 13, color: 'var(--teal)' }}>{featureBranch}</code>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t('take_over_hint')}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={close}>Done</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create remaining page stubs**

```tsx
// packages/frontend/src/pages/LoginPage.tsx
export function LoginPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <a href="/api/v1/auth/github" style={{ padding: '10px 20px', background: 'var(--blue)', color: 'white', borderRadius: 8, textDecoration: 'none' }}>
        Login with GitHub
      </a>
    </div>
  );
}
```

```tsx
// packages/frontend/src/pages/OAuthCallbackPage.tsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store.js';

export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    const token = params.get('token');
    const user = params.get('user');
    if (token && user) {
      setAuth(token, JSON.parse(decodeURIComponent(user)));
      navigate('/workspaces');
    }
  }, []);

  return <div style={{ padding: 24, color: 'var(--muted)' }}>Authenticating…</div>;
}
```

```tsx
// packages/frontend/src/pages/WorkspacesPage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkspaces } from '../hooks/useWorkspace.js';
import { EmptyState } from '../features/onboarding/EmptyState.js';
import { FTUEWizard } from '../features/onboarding/FTUEWizard.js';
import { Button } from '../components/ui/Button.js';

export function WorkspacesPage() {
  const { t } = useTranslation('workflow');
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const [showWizard, setShowWizard] = useState(false);

  if (isLoading) return null;

  if (workspaces.length === 0 && !showWizard) {
    return <EmptyState onStart={() => setShowWizard(true)} />;
  }

  if (showWizard) {
    return <FTUEWizard onComplete={(data) => { console.log('Create workspace:', data); setShowWizard(false); }} />;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--ink)', margin: 0 }}>{t('workspace')}s</h2>
        <Button variant="primary" onClick={() => setShowWizard(true)}>+ New</Button>
      </div>
      {workspaces.map((ws) => (
        <Link key={ws.id} to={`/w/${ws.slug}`} style={{ display: 'block', padding: '12px 16px', background: 'var(--surface)', borderRadius: 8, marginBottom: 8, color: 'var(--ink)', textDecoration: 'none' }}>
          {ws.name}
        </Link>
      ))}
    </div>
  );
}
```

```tsx
// packages/frontend/src/pages/WorkspaceOverviewPage.tsx
export function WorkspaceOverviewPage() { return <div style={{ padding: 24, color: 'var(--muted)' }}>Workspace Overview</div>; }
```

```tsx
// packages/frontend/src/pages/RunnerMgmtPage.tsx
export function RunnerMgmtPage() { return <div style={{ padding: 24, color: 'var(--muted)' }}>Runner Management</div>; }
```

```tsx
// packages/frontend/src/pages/SettingsPage.tsx
export function SettingsPage() { return <div style={{ padding: 24, color: 'var(--muted)' }}>Settings</div>; }
```

- [ ] **Step 5: Build and verify**

```bash
cd packages/frontend && pnpm build 2>&1 | tail -10
```

Expected: Build succeeds with zero TypeScript errors.

- [ ] **Step 6: Run all tests**

```bash
cd packages/frontend && pnpm test -- --reporter=verbose
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/features packages/frontend/src/pages packages/frontend/test
git commit -m "feat(frontend): WorkflowTimeline + RunDetailPage + TakeOverModal + page stubs"
```

---

## Task 11: E2E Tests (Playwright)

**Files:**
- Create: `packages/frontend/e2e/playwright.config.ts`
- Create: `packages/frontend/e2e/flows/approval-flow.spec.ts`
- Create: `packages/frontend/e2e/flows/ftue-flow.spec.ts`

- [ ] **Step 1: Create playwright.config.ts**

```typescript
// packages/frontend/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './flows',
  use: { baseURL: 'http://localhost:5173', trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: Write FTUE flow E2E (zh-CN)**

```typescript
// packages/frontend/e2e/flows/ftue-flow.spec.ts
import { test, expect } from '@playwright/test';

test('FTUE wizard — zh-CN — creates workspace', async ({ page }) => {
  // Mock auth (bypass login)
  await page.addInitScript(() => {
    localStorage.setItem('aww-auth', JSON.stringify({ state: { token: 'test-token', user: { id: 'u1', name: 'Test', email: 't@t.com', preferred_language: 'zh-CN' } } }));
    localStorage.setItem('aww-lang', 'zh-CN');
  });

  await page.route('**/api/v1/workspaces', (r) => r.fulfill({ json: { data: [] } }));

  await page.goto('/workspaces');
  await expect(page.getByText('创建')).toBeVisible();
  await page.getByText('创建').click();

  // Step 1: workspace name
  await page.getByPlaceholder('Workspace name').fill('我的项目');
  await page.getByRole('button', { name: '下一步' }).click();

  // Step 2: github (skip)
  await page.getByRole('button', { name: '下一步' }).click();

  // Step 3: PRD
  await page.getByRole('textbox').fill('# PRD\n项目需求文档...');
  await expect(page.getByRole('button', { name: /创建/ })).toBeEnabled();
});
```

- [ ] **Step 3: Write approval flow E2E (en)**

```typescript
// packages/frontend/e2e/flows/approval-flow.spec.ts
import { test, expect } from '@playwright/test';

test('Approval flow — en — submits approve decision', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('aww-auth', JSON.stringify({ state: { token: 'test-token', user: { id: 'u1', name: 'Test', email: 't@t.com', preferred_language: 'en' } } }));
    localStorage.setItem('aww-lang', 'en');
  });

  const mockRun = {
    id: 'run_1', workspace_id: 'ws_1', status: 'running', feature_branch: 'aww/ws/run_1',
    steps: [
      { id: 's_1', position: 1, name: 'Create Workspace', status: 'completed', owner_type: 'human', output_artifact_ids: [] },
      { id: 's_2', position: 2, name: 'Add PRD', status: 'completed', owner_type: 'human', output_artifact_ids: [] },
      { id: 's_3', position: 3, name: 'Approve Plan', status: 'running', owner_type: 'approval_gate', output_artifact_ids: [] },
    ],
  };

  await page.route('**/api/v1/runs/run_1', (r) => r.fulfill({ json: { data: mockRun } }));
  await page.route('**/api/v1/steps/s_3/decision', (r) => r.fulfill({ json: { data: { id: 'd_1', action: 'approve' } } }));

  await page.goto('/w/test-workspace/runs/run_1');
  await expect(page.getByText('Approve')).toBeVisible();
  await page.getByText('Approve').first().click();
  await expect(page.getByText('Decision submitted')).toBeVisible();
});
```

- [ ] **Step 4: Install Playwright browsers**

```bash
cd packages/frontend && npx playwright install chromium --with-deps 2>&1 | tail -5
```

- [ ] **Step 5: Run E2E (requires dev server)**

```bash
cd packages/frontend && pnpm test:e2e 2>&1 | tail -20
```

Expected: both E2E tests PASS (or "passed" in summary)

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/e2e
git commit -m "test(frontend): Playwright E2E — FTUE flow (zh-CN) + approval flow (en)"
```

---

## Verification

After all tasks:

```bash
# All unit tests pass
cd packages/frontend && pnpm test -- --reporter=verbose

# TypeScript build clean
pnpm build

# E2E tests pass
pnpm test:e2e

# i18n check: zh-CN renders 保存, en renders Save
node -e "
import('./src/i18n/index.js').then(async (m) => {
  const i18n = m.default;
  await i18n.changeLanguage('zh-CN');
  console.log('zh-CN save:', i18n.t('save', {ns:'common'}));
  await i18n.changeLanguage('en');
  console.log('en save:', i18n.t('save', {ns:'common'}));
})
" 2>&1
```

Expected: zh-CN prints "保存", en prints "Save".
