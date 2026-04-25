# AWW Local Runner Daemon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AWW Local Runner Daemon — a Node.js 20 TypeScript process that long-polls AWW Cloud for tasks, executes agent sub-processes, calls LLM providers (Anthropic / OpenAI / OpenClaw WebSocket / Hermes local REST), manages git operations, and reports results back via heartbeat + complete/fail endpoints.

**Architecture:** Single Node.js main process owns task polling and child process lifecycle. Each AgentRun spawns a dedicated child process. LLM calls happen in-child via Provider Adapter pattern. Git operations are serialized per WorkflowRun via file-based mutex. CLI entry (`aww runner`) handles registration and daemon start.

**Tech Stack:** Node.js 20, TypeScript 5, `commander` (CLI), `@anthropic-ai/sdk`, `openai`, `ws` (OpenClaw WebSocket), `simple-git`, `toml` (config), `Vitest`, `nock` (HTTP mocking), `ws-mock` (WebSocket mocking)

---

## File Map

```
packages/runner/
├── src/
│   ├── cli.ts               # commander entry: register | start | status
│   ├── daemon.ts            # main daemon loop (poller + heartbeat timers)
│   ├── config.ts            # ~/.aww/config.toml loader + validator
│   ├── registration.ts      # POST /runners/register, persist runner.json
│   ├── poller.ts            # long-poll GET /runners/:id/tasks/claim
│   ├── dispatcher.ts        # route claimed task → agent executor
│   ├── executor.ts          # spawn child process, pipe JSON-RPC, timeout kill
│   ├── git-worker.ts        # simple-git ops with per-run file mutex
│   ├── heartbeat.ts         # AgentRun heartbeat (30s) + Runner heartbeat (60s)
│   ├── reporter.ts          # complete/fail result upload
│   ├── checkpoint.ts        # read/write ~/.aww/state/{run-id}.json
│   ├── api-client.ts        # fetch wrapper (HMAC-signed for runner endpoints)
│   └── providers/
│       ├── registry.ts      # ProviderRegistry: load, probe, route
│       ├── types.ts         # LLMProvider interface + CompletionRequest/Response
│       ├── anthropic.ts     # AnthropicAdapter (HTTPS REST)
│       ├── openai.ts        # OpenAIAdapter (HTTPS REST, OpenAI-compatible)
│       ├── openclaw.ts      # OpenClawAdapter (WebSocket ws://localhost:18789)
│       └── hermes.ts        # HermesAdapter (local REST, configurable port)
├── src/agents/
│   ├── protocol.ts          # JSON-RPC protocol types (child ↔ parent)
│   ├── planner.ts           # Planner agent (child process entrypoint)
│   ├── tasker.ts            # Task breakdown agent
│   ├── coder.ts             # Coding agent
│   ├── tester.ts            # Test agent
│   ├── reviewer.ts          # Review agent
│   └── summarizer.ts        # Summarizer agent
├── test/
│   ├── helpers/
│   │   ├── mock-server.ts   # nock-based AWW Cloud mock
│   │   └── tmp-dir.ts       # temp dir creation/cleanup
│   ├── providers/
│   │   ├── anthropic.test.ts
│   │   ├── openai.test.ts
│   │   ├── openclaw.test.ts
│   │   └── hermes.test.ts
│   ├── registry.test.ts
│   ├── poller.test.ts
│   ├── git-worker.test.ts
│   ├── executor.test.ts
│   └── heartbeat.test.ts
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Task 1: Runner Package Setup

**Files:**
- Create: `packages/runner/package.json`
- Create: `packages/runner/tsconfig.json`
- Create: `packages/runner/src/config.ts`
- Create: `packages/runner/test/helpers/tmp-dir.ts`

- [ ] **Step 1: Create package.json**

```bash
mkdir -p packages/runner/src/providers packages/runner/src/agents packages/runner/test/helpers packages/runner/test/providers
```

```json
// packages/runner/package.json
{
  "name": "@aww/runner",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "aww": "./dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/cli.ts",
    "start": "node dist/cli.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "commander": "^12.0.0",
    "openai": "^4.47.0",
    "simple-git": "^3.24.0",
    "smol-toml": "^1.1.4",
    "ws": "^8.17.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.10",
    "nock": "^13.5.4",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// packages/runner/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Write failing test for config loader**

```typescript
// packages/runner/test/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, ConfigError } from '../src/config.js';

describe('loadConfig', () => {
  let dir: string;

  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'aww-test-')); });
  afterEach(async () => { await rm(dir, { recursive: true }); });

  it('loads valid config', async () => {
    const toml = `
[cloud]
base_url = "http://localhost:3000"

[runner]
runner_id = "r_123"
runner_secret = "secret"
workspace_id = "ws_abc"

[providers.anthropic]
api_key = "sk-ant-test"
    `;
    await writeFile(join(dir, 'config.toml'), toml);
    const cfg = await loadConfig(join(dir, 'config.toml'));
    expect(cfg.cloud.base_url).toBe('http://localhost:3000');
    expect(cfg.runner.runner_id).toBe('r_123');
    expect(cfg.providers.anthropic?.api_key).toBe('sk-ant-test');
  });

  it('throws ConfigError when file missing', async () => {
    await expect(loadConfig(join(dir, 'missing.toml'))).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when required fields absent', async () => {
    await writeFile(join(dir, 'config.toml'), '[cloud]\n');
    await expect(loadConfig(join(dir, 'config.toml'))).rejects.toBeInstanceOf(ConfigError);
  });
});
```

- [ ] **Step 4: Run test — must FAIL**

```bash
cd packages/runner && pnpm test -- --reporter=verbose 2>&1 | head -30
```

Expected: `FAIL` with "Cannot find module '../src/config.js'"

- [ ] **Step 5: Implement config.ts**

```typescript
// packages/runner/src/config.ts
import { readFile } from 'node:fs/promises';
import { parse } from 'smol-toml';

export class ConfigError extends Error {}

export interface RunnerConfig {
  cloud: { base_url: string };
  runner: { runner_id: string; runner_secret: string; workspace_id: string; max_concurrent_agents?: number };
  providers: {
    anthropic?: { api_key: string };
    openai?: { api_key: string; base_url?: string };
    openclaw?: { gateway_url?: string };
    hermes?: { base_url?: string };
  };
}

export async function loadConfig(path: string): Promise<RunnerConfig> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    throw new ConfigError(`Config file not found: ${path}`);
  }
  const parsed = parse(raw) as Record<string, unknown>;
  if (!parsed.cloud || !(parsed.cloud as Record<string, unknown>).base_url) {
    throw new ConfigError('Missing required [cloud].base_url');
  }
  if (!parsed.runner) throw new ConfigError('Missing required [runner] section');
  const r = parsed.runner as Record<string, unknown>;
  if (!r.runner_id || !r.runner_secret || !r.workspace_id) {
    throw new ConfigError('Missing required runner.runner_id / runner_secret / workspace_id');
  }
  return parsed as unknown as RunnerConfig;
}
```

- [ ] **Step 6: Run test — must PASS**

```bash
cd packages/runner && pnpm test -- --reporter=verbose
```

Expected: all 3 config tests PASS

- [ ] **Step 7: Create tmp-dir helper**

```typescript
// packages/runner/test/helpers/tmp-dir.ts
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'aww-runner-test-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/runner
git commit -m "feat(runner): package setup and config loader"
```

---

## Task 2: LLM Provider Types + Registry

**Files:**
- Create: `packages/runner/src/providers/types.ts`
- Create: `packages/runner/src/providers/registry.ts`
- Create: `packages/runner/test/registry.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/runner/test/registry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ProviderRegistry } from '../src/providers/registry.js';
import type { LLMProvider, CompletionRequest } from '../src/providers/types.js';

function makeProvider(id: string, available: boolean): LLMProvider {
  return {
    id,
    isAvailable: vi.fn().mockResolvedValue(available),
    complete: vi.fn().mockResolvedValue({ content: 'ok', stop_reason: 'end_turn' }),
  };
}

describe('ProviderRegistry', () => {
  it('routes to preferred provider when available', async () => {
    const a = makeProvider('anthropic', true);
    const b = makeProvider('openai', true);
    const reg = new ProviderRegistry([a, b]);
    await reg.probe();
    const req: CompletionRequest = { model: 'claude-opus', messages: [], max_tokens: 100 };
    await reg.complete(req, 'anthropic');
    expect(a.complete).toHaveBeenCalledWith(req);
    expect(b.complete).not.toHaveBeenCalled();
  });

  it('falls back to next provider when preferred unavailable', async () => {
    const a = makeProvider('anthropic', false);
    const b = makeProvider('openai', true);
    const reg = new ProviderRegistry([a, b]);
    await reg.probe();
    const req: CompletionRequest = { model: 'gpt-4', messages: [], max_tokens: 100 };
    await reg.complete(req, 'anthropic');
    expect(b.complete).toHaveBeenCalled();
  });

  it('throws when no providers available', async () => {
    const reg = new ProviderRegistry([makeProvider('anthropic', false)]);
    await reg.probe();
    await expect(reg.complete({ model: 'm', messages: [], max_tokens: 10 }, 'anthropic')).rejects.toThrow('No available LLM provider');
  });

  it('lists available provider ids', async () => {
    const reg = new ProviderRegistry([makeProvider('anthropic', true), makeProvider('openclaw', false)]);
    await reg.probe();
    expect(reg.availableIds()).toEqual(['anthropic']);
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/runner && pnpm test registry -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement types.ts**

```typescript
// packages/runner/src/providers/types.ts
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface CompletionRequest {
  model: string;
  messages: Message[];
  tools?: Tool[];
  max_tokens: number;
  system?: string;
}

export interface CompletionResponse {
  content: string;
  tool_calls?: ToolCall[];
  tokens_used?: number;
  stop_reason: 'end_turn' | 'max_tokens' | 'tool_use';
}

export interface LLMProvider {
  id: string;
  isAvailable(): Promise<boolean>;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}
```

- [ ] **Step 4: Implement registry.ts**

```typescript
// packages/runner/src/providers/registry.ts
import type { LLMProvider, CompletionRequest, CompletionResponse } from './types.js';

export class NoProviderError extends Error {}

export class ProviderRegistry {
  private available: Set<string> = new Set();

  constructor(private providers: LLMProvider[]) {}

  async probe(): Promise<void> {
    const results = await Promise.allSettled(
      this.providers.map(async (p) => ({ id: p.id, ok: await p.isAvailable() }))
    );
    this.available.clear();
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) this.available.add(r.value.id);
    }
  }

  availableIds(): string[] {
    return this.providers.filter((p) => this.available.has(p.id)).map((p) => p.id);
  }

  async complete(req: CompletionRequest, preferredId: string): Promise<CompletionResponse> {
    const ordered = [
      ...this.providers.filter((p) => p.id === preferredId && this.available.has(p.id)),
      ...this.providers.filter((p) => p.id !== preferredId && this.available.has(p.id)),
    ];
    if (ordered.length === 0) throw new NoProviderError('No available LLM provider');
    return ordered[0].complete(req);
  }
}
```

- [ ] **Step 5: Run — must PASS**

```bash
cd packages/runner && pnpm test registry -- --reporter=verbose
```

- [ ] **Step 6: Commit**

```bash
git add packages/runner/src/providers/types.ts packages/runner/src/providers/registry.ts packages/runner/test/registry.test.ts
git commit -m "feat(runner): LLM provider types + ProviderRegistry with fallback"
```

---

## Task 3: AnthropicAdapter

**Files:**
- Create: `packages/runner/src/providers/anthropic.ts`
- Create: `packages/runner/test/providers/anthropic.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/runner/test/providers/anthropic.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicAdapter } from '../../src/providers/anthropic.js';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Hello from Anthropic' }],
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: 'end_turn',
        }),
      };
    },
  };
});

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter({ api_key: 'sk-ant-test' });
  });

  it('has id = anthropic', () => {
    expect(adapter.id).toBe('anthropic');
  });

  it('isAvailable returns true when api_key set', async () => {
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when api_key empty', async () => {
    const a = new AnthropicAdapter({ api_key: '' });
    expect(await a.isAvailable()).toBe(false);
  });

  it('complete maps response correctly', async () => {
    const res = await adapter.complete({
      model: 'claude-opus-4-7',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 100,
    });
    expect(res.content).toBe('Hello from Anthropic');
    expect(res.tokens_used).toBe(15);
    expect(res.stop_reason).toBe('end_turn');
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/runner && pnpm test anthropic -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement anthropic.ts**

```typescript
// packages/runner/src/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, CompletionRequest, CompletionResponse } from './types.js';

export class AnthropicAdapter implements LLMProvider {
  readonly id = 'anthropic';
  private client: Anthropic;

  constructor(private cfg: { api_key: string }) {
    this.client = new Anthropic({ apiKey: cfg.api_key });
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.cfg.api_key);
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const messages = req.messages.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    const systemMsg = req.messages.find((m) => m.role === 'system');

    const res = await this.client.messages.create({
      model: req.model,
      messages,
      system: req.system ?? systemMsg?.content,
      max_tokens: req.max_tokens,
      tools: req.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool['input_schema'],
      })),
    });

    const textBlock = res.content.find((b) => b.type === 'text');
    const toolBlock = res.content.filter((b) => b.type === 'tool_use');
    const tokens_used = (res.usage.input_tokens ?? 0) + (res.usage.output_tokens ?? 0);

    return {
      content: textBlock?.type === 'text' ? textBlock.text : '',
      tokens_used,
      stop_reason: res.stop_reason === 'tool_use' ? 'tool_use'
        : res.stop_reason === 'max_tokens' ? 'max_tokens' : 'end_turn',
      tool_calls: toolBlock.map((b) => b.type === 'tool_use' ? ({
        id: b.id,
        name: b.name,
        input: b.input as Record<string, unknown>,
      }) : undefined).filter(Boolean) as CompletionResponse['tool_calls'],
    };
  }
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/runner && pnpm test providers/anthropic -- --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src/providers/anthropic.ts packages/runner/test/providers/anthropic.test.ts
git commit -m "feat(runner): AnthropicAdapter"
```

---

## Task 4: OpenAIAdapter

**Files:**
- Create: `packages/runner/src/providers/openai.ts`
- Create: `packages/runner/test/providers/openai.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/runner/test/providers/openai.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIAdapter } from '../../src/providers/openai.js';

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'OpenAI response', tool_calls: null }, finish_reason: 'stop' }],
            usage: { total_tokens: 20 },
          }),
        },
      };
    },
  };
});

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter({ api_key: 'sk-test' });
  });

  it('has id = openai', () => { expect(adapter.id).toBe('openai'); });

  it('isAvailable true when api_key set', async () => {
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable false when api_key empty', async () => {
    expect(await new OpenAIAdapter({ api_key: '' }).isAvailable()).toBe(false);
  });

  it('maps response content and tokens', async () => {
    const res = await adapter.complete({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
    });
    expect(res.content).toBe('OpenAI response');
    expect(res.tokens_used).toBe(20);
    expect(res.stop_reason).toBe('end_turn');
  });

  it('accepts custom base_url for OpenAI-compatible endpoints', () => {
    const a = new OpenAIAdapter({ api_key: 'x', base_url: 'http://localhost:11434/v1' });
    expect(a.id).toBe('openai');
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/runner && pnpm test providers/openai -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement openai.ts**

```typescript
// packages/runner/src/providers/openai.ts
import OpenAIClient from 'openai';
import type { LLMProvider, CompletionRequest, CompletionResponse } from './types.js';

export class OpenAIAdapter implements LLMProvider {
  readonly id = 'openai';
  private client: OpenAIClient;

  constructor(private cfg: { api_key: string; base_url?: string }) {
    this.client = new OpenAIClient({ apiKey: cfg.api_key, baseURL: cfg.base_url });
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.cfg.api_key);
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const messages: OpenAIClient.ChatCompletionMessageParam[] = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    if (req.system) messages.unshift({ role: 'system', content: req.system });

    const res = await this.client.chat.completions.create({
      model: req.model,
      messages,
      max_tokens: req.max_tokens,
      tools: req.tools?.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      })),
    });

    const choice = res.choices[0];
    const finish = choice.finish_reason;

    return {
      content: choice.message.content ?? '',
      tokens_used: res.usage?.total_tokens,
      stop_reason: finish === 'tool_calls' ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn',
      tool_calls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })),
    };
  }
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/runner && pnpm test providers/openai -- --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src/providers/openai.ts packages/runner/test/providers/openai.test.ts
git commit -m "feat(runner): OpenAIAdapter with OpenAI-compatible endpoint support"
```

---

## Task 5: OpenClawAdapter (WebSocket, connect-first protocol)

**Files:**
- Create: `packages/runner/src/providers/openclaw.ts`
- Create: `packages/runner/test/providers/openclaw.test.ts`

**Protocol reference (INF-01 confirmed):**
- Frame types: `req` (client → gateway), `res` (gateway → client, matched by `id`), `event` (gateway push, no `id`)
- Connect handshake: gateway sends `event connect.challenge` → client sends `req connect` → gateway replies `res { message: 'hello-ok' }`
- Completion: client sends `req llm.complete` → gateway may send streaming `event llm.stream` frames → gateway sends final `res llm.complete`
- Auth: optional `api_key` field in `connect` params; gateway accepts absent field for unauthenticated local use

- [ ] **Step 1: Write failing test**

```typescript
// packages/runner/test/providers/openclaw.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import { OpenClawAdapter } from '../../src/providers/openclaw.js';

function startMockGateway(): Promise<{ wss: WebSocketServer; port: number }> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 });
    wss.on('listening', () => {
      resolve({ wss, port: (wss.address() as { port: number }).port });
    });
  });
}

function closeGateway(wss: WebSocketServer): Promise<void> {
  return new Promise((r) => wss.close(() => r()));
}

describe('OpenClawAdapter', () => {
  let wss: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    ({ wss, port } = await startMockGateway());
  });

  afterEach(async () => {
    await closeGateway(wss);
  });

  it('has id = openclaw', () => {
    expect(new OpenClawAdapter({ gateway_url: 'ws://localhost:18789' }).id).toBe('openclaw');
  });

  it('isAvailable returns true when gateway reachable', async () => {
    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}` });
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when gateway unreachable', async () => {
    const adapter = new OpenClawAdapter({ gateway_url: 'ws://localhost:19999' });
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('complete performs connect handshake and receives non-streaming response', async () => {
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ kind: 'event', method: 'connect.challenge', params: { nonce: 'abc123' } }));

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as { kind?: string; method?: string; id?: string };

        if (msg.kind === 'req' && msg.method === 'connect') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { message: 'hello-ok', protocol: '1.0', features: ['completion'] } }));
          return;
        }
        if (msg.kind === 'req' && msg.method === 'llm.complete') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { content: 'OpenClaw says hi', stop_reason: 'end_turn' } }));
        }
      });
    });

    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}` });
    const res = await adapter.complete({ model: 'openclaw-default', messages: [{ role: 'user', content: 'Hello' }], max_tokens: 100 });
    expect(res.content).toBe('OpenClaw says hi');
    expect(res.stop_reason).toBe('end_turn');
  });

  it('complete aggregates streaming event frames into final content', async () => {
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ kind: 'event', method: 'connect.challenge', params: { nonce: 'xyz' } }));

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as { kind?: string; method?: string; id?: string };

        if (msg.kind === 'req' && msg.method === 'connect') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { message: 'hello-ok', protocol: '1.0' } }));
          return;
        }
        if (msg.kind === 'req' && msg.method === 'llm.complete') {
          // Simulate streaming: send partial chunks then final res
          ws.send(JSON.stringify({ kind: 'event', method: 'llm.stream', params: { chunk: 'Hello ' } }));
          ws.send(JSON.stringify({ kind: 'event', method: 'llm.stream', params: { chunk: 'world' } }));
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { content: null, stop_reason: 'end_turn' } }));
        }
      });
    });

    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}` });
    const res = await adapter.complete({ model: 'openclaw-default', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100 });
    expect(res.content).toBe('Hello world');
    expect(res.stop_reason).toBe('end_turn');
  });

  it('complete rejects on gateway error response', async () => {
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ kind: 'event', method: 'connect.challenge', params: { nonce: 'err' } }));

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as { kind?: string; method?: string; id?: string };

        if (msg.kind === 'req' && msg.method === 'connect') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { message: 'hello-ok', protocol: '1.0' } }));
          return;
        }
        if (msg.kind === 'req' && msg.method === 'llm.complete') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, error: { code: 'rate_limit', message: 'Too many requests' } }));
        }
      });
    });

    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}` });
    await expect(
      adapter.complete({ model: 'openclaw-default', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100 })
    ).rejects.toThrow('Too many requests');
  });

  it('includes api_key in connect params when configured', async () => {
    let connectParams: Record<string, unknown> = {};
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ kind: 'event', method: 'connect.challenge', params: { nonce: 'k' } }));
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as { kind?: string; method?: string; id?: string; params?: Record<string, unknown> };
        if (msg.kind === 'req' && msg.method === 'connect') {
          connectParams = msg.params ?? {};
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { message: 'hello-ok', protocol: '1.0' } }));
        }
        if (msg.kind === 'req' && msg.method === 'llm.complete') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { content: 'ok', stop_reason: 'end_turn' } }));
        }
      });
    });

    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}`, api_key: 'test-key-abc' });
    await adapter.complete({ model: 'openclaw-default', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100 });
    expect(connectParams['api_key']).toBe('test-key-abc');
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/runner && pnpm test providers/openclaw -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement openclaw.ts**

```typescript
// packages/runner/src/providers/openclaw.ts
import { WebSocket } from 'ws';
import type { LLMProvider, CompletionRequest, CompletionResponse } from './types.js';
import { randomUUID } from 'node:crypto';

interface GatewayMessage {
  kind: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: { code?: string; message?: string };
}

// Maps OpenClaw Gateway error codes to human-readable descriptions
const OPENCLAW_ERROR_LABELS: Record<string, string> = {
  rate_limit:     'Rate limit exceeded',
  auth_failed:    'Authentication failed — check api_key in config',
  invalid_model:  'Model not supported by this Gateway',
  context_length: 'Context length exceeded max_tokens',
};

export class OpenClawAdapter implements LLMProvider {
  readonly id = 'openclaw';

  constructor(private cfg: { gateway_url?: string; api_key?: string }) {}

  private get gatewayUrl(): string {
    return this.cfg.gateway_url ?? 'ws://localhost:18789';
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(this.gatewayUrl);
      const timer = setTimeout(() => { ws.terminate(); resolve(false); }, 2000);
      ws.on('open', () => { clearTimeout(timer); ws.close(); resolve(true); });
      ws.on('error', () => { clearTimeout(timer); resolve(false); });
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.gatewayUrl);
      const connectId = randomUUID();
      const msgId = randomUUID();
      let connected = false;
      let streamedContent = '';

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('OpenClaw Gateway timeout after 60s'));
      }, 60_000);

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as GatewayMessage;

        // Step 1: Gateway sends connect.challenge, we reply with connect (+ optional auth)
        if (msg.kind === 'event' && msg.method === 'connect.challenge') {
          const connectParams: Record<string, unknown> = { client: 'aww-runner', protocol: '1.0' };
          if (this.cfg.api_key) connectParams['api_key'] = this.cfg.api_key;
          ws.send(JSON.stringify({ kind: 'req', id: connectId, method: 'connect', params: connectParams }));
          return;
        }

        // Step 2: Gateway confirms connection (hello-ok), we send the completion request
        if (msg.kind === 'res' && msg.id === connectId) {
          if (msg.error) {
            clearTimeout(timeout); ws.close();
            const label = msg.error.code ? (OPENCLAW_ERROR_LABELS[msg.error.code] ?? msg.error.message) : msg.error.message;
            reject(new Error(`OpenClaw connect failed: ${label ?? 'unknown'}`));
            return;
          }
          connected = true;
          ws.send(JSON.stringify({
            kind: 'req',
            id: msgId,
            method: 'llm.complete',
            params: { model: req.model, messages: req.messages, system: req.system, max_tokens: req.max_tokens, tools: req.tools },
          }));
          return;
        }

        // Step 3a: Streaming partial chunks (aggregate into streamedContent)
        if (msg.kind === 'event' && msg.method === 'llm.stream' && connected) {
          streamedContent += String(msg.params?.chunk ?? '');
          return;
        }

        // Step 3b: Final completion response
        if (msg.kind === 'res' && msg.id === msgId && connected) {
          clearTimeout(timeout);
          ws.close();
          if (msg.error) {
            const code = msg.error.code ?? '';
            const label = OPENCLAW_ERROR_LABELS[code] ?? msg.error.message ?? 'unknown error';
            reject(new Error(label));
            return;
          }
          // Use streamed content if Gateway sent chunks; fall back to result.content
          const content = streamedContent || String(msg.result?.content ?? '');
          resolve({
            content,
            stop_reason: (msg.result?.stop_reason as CompletionResponse['stop_reason']) ?? 'end_turn',
          });
        }
      });

      ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
  }
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/runner && pnpm test providers/openclaw -- --reporter=verbose
```

Expected: all 5 tests PASS (isAvailable ×2, non-streaming, streaming, error, api_key)

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src/providers/openclaw.ts packages/runner/test/providers/openclaw.test.ts
git commit -m "feat(runner): OpenClawAdapter — connect-first handshake, streaming aggregation, auth field, error mapping"
```

---

## Task 6: HermesAdapter (Nous Hermes Agent API Server)

**Files:**
- Create: `packages/runner/src/providers/hermes.ts`
- Create: `packages/runner/test/providers/hermes.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/runner/test/providers/hermes.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import nock from 'nock';
import { HermesAdapter } from '../../src/providers/hermes.js';

afterEach(() => nock.cleanAll());

describe('HermesAdapter', () => {
  const BASE = 'http://localhost:8000';

  it('has id = hermes', () => {
    expect(new HermesAdapter({ base_url: BASE }).id).toBe('hermes');
  });

  it('isAvailable when /health returns 200', async () => {
    nock(BASE).get('/health').reply(200, { status: 'ok' });
    const adapter = new HermesAdapter({ base_url: BASE });
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable false when /health fails', async () => {
    nock(BASE).get('/health').replyWithError('ECONNREFUSED');
    const adapter = new HermesAdapter({ base_url: BASE });
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('complete calls POST /v1/chat/completions and maps response', async () => {
    nock(BASE)
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [{ message: { content: 'Hermes response' }, finish_reason: 'stop' }],
        usage: { total_tokens: 42 },
      });
    const adapter = new HermesAdapter({ base_url: BASE });
    const res = await adapter.complete({ model: 'hermes', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100 });
    expect(res.content).toBe('Hermes response');
    expect(res.tokens_used).toBe(42);
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/runner && pnpm test providers/hermes -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement hermes.ts**

```typescript
// packages/runner/src/providers/hermes.ts
import type { LLMProvider, CompletionRequest, CompletionResponse } from './types.js';

interface HermesChatCompletionResponse {
  choices: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { total_tokens?: number };
}

export class HermesAdapter implements LLMProvider {
  readonly id = 'hermes';

  constructor(private cfg: { base_url?: string }) {}

  private get baseUrl(): string {
    return this.cfg.base_url ?? 'http://localhost:8000';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
      const fallback = await fetch(`${this.baseUrl}/health/detailed`, { signal: AbortSignal.timeout(2000) });
      return fallback.ok;
    } catch {
      return false;
    }
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        system: req.system,
        max_tokens: req.max_tokens,
        tools: req.tools,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Hermes API error ${res.status}: ${text}`);
    }
    const data = await res.json() as HermesChatCompletionResponse;
    const choice = data.choices?.[0];
    const finish = choice?.finish_reason;
    return {
      content: choice?.message?.content ?? '',
      stop_reason: finish === 'length' ? 'max_tokens' : finish === 'tool_calls' ? 'tool_use' : 'end_turn',
      tokens_used: data.usage?.total_tokens,
    };
  }
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/runner && pnpm test providers/hermes -- --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src/providers/hermes.ts packages/runner/test/providers/hermes.test.ts
git commit -m "feat(runner): HermesAdapter — local REST API"
```

---

## Task 7: Git Worker

**Files:**
- Create: `packages/runner/src/git-worker.ts`
- Create: `packages/runner/test/git-worker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/runner/test/git-worker.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { simpleGit } from 'simple-git';
import { GitWorker } from '../src/git-worker.js';

async function initBareRepo(dir: string): Promise<void> {
  const git = simpleGit(dir);
  await git.init(true); // bare repo
}

async function initLocalRepo(local: string, remote: string): Promise<void> {
  const git = simpleGit(local);
  await git.clone(remote, local, ['--local']);
  await simpleGit(local).addConfig('user.email', 'test@test.com');
  await simpleGit(local).addConfig('user.name', 'Test');
  // initial commit
  await writeFile(join(local, 'README.md'), '# AWW');
  await simpleGit(local).add('README.md');
  await simpleGit(local).commit('init');
  await simpleGit(local).push('origin', 'main', ['--set-upstream']);
}

describe('GitWorker', () => {
  let remoteDir: string;
  let localDir: string;
  let worker: GitWorker;

  beforeEach(async () => {
    remoteDir = await mkdtemp(join(tmpdir(), 'aww-remote-'));
    localDir = await mkdtemp(join(tmpdir(), 'aww-local-'));
    await initBareRepo(remoteDir);
    await initLocalRepo(localDir, remoteDir);
    worker = new GitWorker(localDir, 'run-abc');
  });

  afterEach(async () => {
    await rm(remoteDir, { recursive: true, force: true });
    await rm(localDir, { recursive: true, force: true });
  });

  it('createFeatureBranch creates branch from HEAD', async () => {
    await worker.createFeatureBranch('aww/ws/run-abc');
    const git = simpleGit(localDir);
    const branches = await git.branchLocal();
    expect(branches.all).toContain('aww/ws/run-abc');
  });

  it('commitAll creates a commit', async () => {
    await worker.createFeatureBranch('aww/ws/run-abc');
    await writeFile(join(localDir, 'output.ts'), 'const x = 1;');
    const sha = await worker.commitAll('aww(step-1): generated code');
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });

  it('getDiffStat returns stat string', async () => {
    await worker.createFeatureBranch('aww/ws/run-abc');
    await writeFile(join(localDir, 'output.ts'), 'const x = 1;');
    await worker.commitAll('aww(step-1): generated code');
    const stat = await worker.getDiffStat();
    expect(stat).toContain('output.ts');
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/runner && pnpm test git-worker -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement git-worker.ts**

```typescript
// packages/runner/src/git-worker.ts
import { simpleGit, type SimpleGit } from 'simple-git';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export class GitWorker {
  private git: SimpleGit;
  private lockPath: string;

  constructor(private repoPath: string, private runId: string) {
    this.git = simpleGit(repoPath);
    const lockDir = join(homedir(), '.aww', 'locks');
    mkdirSync(lockDir, { recursive: true });
    this.lockPath = join(lockDir, `${runId}.lock`);
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    // Simple advisory file lock — sufficient for single-machine MVP
    const lockStream = createWriteStream(this.lockPath, { flags: 'wx' }).on('error', () => {});
    try {
      return await fn();
    } finally {
      lockStream.close();
      try { (await import('node:fs/promises')).unlink(this.lockPath); } catch {}
    }
  }

  async fetch(): Promise<void> {
    return this.withLock(() => this.git.fetch('origin'));
  }

  async createFeatureBranch(branchName: string): Promise<void> {
    return this.withLock(async () => {
      const branches = await this.git.branchLocal();
      if (!branches.all.includes(branchName)) {
        await this.git.checkoutLocalBranch(branchName);
      } else {
        await this.git.checkout(branchName);
        await this.git.pull('origin', branchName, ['--ff-only']).catch(() => {});
      }
    });
  }

  async commitAll(message: string): Promise<string> {
    return this.withLock(async () => {
      await this.git.add('-A');
      await this.git.commit(message);
      const log = await this.git.log({ maxCount: 1 });
      return log.latest!.hash;
    });
  }

  async pushBranch(branchName: string): Promise<void> {
    return this.withLock(async () => {
      try {
        await this.git.push('origin', branchName, ['--set-upstream']);
      } catch {
        // Rebase and retry on non-fast-forward
        await this.git.pull('origin', branchName, ['--rebase']);
        await this.git.push('origin', branchName);
      }
    });
  }

  async getDiffStat(): Promise<string> {
    const result = await this.git.diff(['HEAD~1', 'HEAD', '--stat']);
    return result;
  }
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/runner && pnpm test git-worker -- --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src/git-worker.ts packages/runner/test/git-worker.test.ts
git commit -m "feat(runner): GitWorker with per-run file mutex"
```

---

## Task 8: API Client (HMAC-signed)

**Files:**
- Create: `packages/runner/src/api-client.ts`
- Create: `packages/runner/test/api-client.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/runner/test/api-client.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { RunnerApiClient } from '../src/api-client.js';

afterEach(() => nock.cleanAll());

const BASE = 'http://localhost:3000';

describe('RunnerApiClient', () => {
  const client = new RunnerApiClient({ base_url: BASE, runner_id: 'r_1', runner_secret: 'secret' });

  it('includes Authorization header with HMAC scheme', async () => {
    let authHeader = '';
    nock(BASE)
      .post('/api/v1/agent-runs/ar_1/heartbeat')
      .reply(function () { authHeader = this.req.headers['authorization'] as string; return [200, {}]; });

    await client.heartbeat('ar_1', { tokens_used: 10 });
    expect(authHeader).toMatch(/^Runner r_1:/);
  });

  it('pollTask returns null on 204', async () => {
    nock(BASE).get('/api/v1/runners/r_1/tasks/claim').query({ timeout: '25' }).reply(204);
    const task = await client.pollTask(25);
    expect(task).toBeNull();
  });

  it('pollTask returns task on 200', async () => {
    nock(BASE).get('/api/v1/runners/r_1/tasks/claim').query({ timeout: '25' })
      .reply(200, { data: { agent_run_id: 'ar_1', step_id: 's_1', agent_role: 'planner' } });
    const task = await client.pollTask(25);
    expect(task?.agent_run_id).toBe('ar_1');
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/runner && pnpm test api-client -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement api-client.ts**

```typescript
// packages/runner/src/api-client.ts
import { createHmac } from 'node:crypto';

export interface ClaimedTask {
  agent_run_id: string;
  step_id: string;
  agent_role: string;
  input_artifact_ids: string[];
  preferred_provider: string;
  checkpoint_data?: Record<string, unknown>;
}

export class RunnerApiClient {
  constructor(private cfg: { base_url: string; runner_id: string; runner_secret: string }) {}

  private sign(body: string): string {
    const sig = createHmac('sha256', this.cfg.runner_secret).update(body).digest('hex');
    return `Runner ${this.cfg.runner_id}:${sig}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const bodyStr = body ? JSON.stringify(body) : '';
    const res = await fetch(`${this.cfg.base_url}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.sign(bodyStr),
      },
      body: bodyStr || undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
    const json = await res.json() as { data: T };
    return json.data;
  }

  async pollTask(timeoutSeconds = 25): Promise<ClaimedTask | null> {
    try {
      const task = await this.request<ClaimedTask | null>(
        'GET',
        `/api/v1/runners/${this.cfg.runner_id}/tasks/claim?timeout=${timeoutSeconds}`
      );
      return task ?? null;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('204')) return null;
      throw err;
    }
  }

  async heartbeat(agentRunId: string, data: Record<string, unknown>): Promise<void> {
    await this.request('POST', `/api/v1/agent-runs/${agentRunId}/heartbeat`, data);
  }

  async complete(agentRunId: string, data: Record<string, unknown>): Promise<void> {
    await this.request('POST', `/api/v1/agent-runs/${agentRunId}/complete`, data);
  }

  async fail(agentRunId: string, data: Record<string, unknown>): Promise<void> {
    await this.request('POST', `/api/v1/agent-runs/${agentRunId}/fail`, data);
  }

  async ackTask(taskId: string): Promise<void> {
    await this.request('POST', `/api/v1/runners/${this.cfg.runner_id}/tasks/${taskId}/ack`);
  }
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/runner && pnpm test api-client -- --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src/api-client.ts packages/runner/test/api-client.test.ts
git commit -m "feat(runner): HMAC-signed API client"
```

---

## Task 9: Task Poller

**Files:**
- Create: `packages/runner/src/poller.ts`
- Create: `packages/runner/test/poller.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/runner/test/poller.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskPoller } from '../src/poller.js';
import type { RunnerApiClient, ClaimedTask } from '../src/api-client.js';

function makeClient(tasks: Array<ClaimedTask | null>): RunnerApiClient {
  const iter = tasks[Symbol.iterator]();
  return {
    pollTask: vi.fn().mockImplementation(() => Promise.resolve(iter.next().value ?? null)),
    ackTask: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  } as unknown as RunnerApiClient;
}

describe('TaskPoller', () => {
  it('calls onTask callback when task arrives', async () => {
    const task: ClaimedTask = { agent_run_id: 'ar_1', step_id: 's_1', agent_role: 'planner', input_artifact_ids: [], preferred_provider: 'anthropic' };
    const client = makeClient([null, task]);
    const onTask = vi.fn();
    const poller = new TaskPoller(client, onTask, { intervalMs: 0, maxIterations: 2 });

    await poller.run();
    expect(onTask).toHaveBeenCalledWith(task);
    expect(client.ackTask).toHaveBeenCalledWith('ar_1');
  });

  it('does not block on null (no task) responses', async () => {
    const client = makeClient([null, null]);
    const onTask = vi.fn();
    const poller = new TaskPoller(client, onTask, { intervalMs: 0, maxIterations: 2 });
    await poller.run();
    expect(onTask).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/runner && pnpm test poller -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement poller.ts**

```typescript
// packages/runner/src/poller.ts
import type { RunnerApiClient, ClaimedTask } from './api-client.js';

interface PollerOptions {
  intervalMs?: number;
  maxIterations?: number;    // only for testing; production = Infinity
  timeoutSeconds?: number;
}

export class TaskPoller {
  private running = false;

  constructor(
    private client: RunnerApiClient,
    private onTask: (task: ClaimedTask) => void,
    private opts: PollerOptions = {}
  ) {}

  async run(): Promise<void> {
    this.running = true;
    const max = this.opts.maxIterations ?? Infinity;
    let i = 0;

    while (this.running && i < max) {
      i++;
      try {
        const task = await this.client.pollTask(this.opts.timeoutSeconds ?? 25);
        if (task) {
          await this.client.ackTask(task.agent_run_id);
          this.onTask(task);
        }
      } catch (err) {
        // Exponential backoff on error
        const delay = Math.min(1000 * 2 ** Math.min(i, 5), 30_000);
        await new Promise((r) => setTimeout(r, this.opts.intervalMs ?? delay));
      }
      if (this.opts.intervalMs !== undefined) {
        await new Promise((r) => setTimeout(r, this.opts.intervalMs));
      }
    }
  }

  stop(): void { this.running = false; }
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/runner && pnpm test poller -- --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src/poller.ts packages/runner/test/poller.test.ts
git commit -m "feat(runner): TaskPoller with long-poll and exponential backoff"
```

---

## Task 10: Agent Executor (Subprocess)

**Files:**
- Create: `packages/runner/src/agents/protocol.ts`
- Create: `packages/runner/src/executor.ts`
- Create: `packages/runner/test/executor.test.ts`

- [ ] **Step 1: Define agent JSON-RPC protocol**

```typescript
// packages/runner/src/agents/protocol.ts
export interface AgentRequest {
  type: 'run';
  agent_run_id: string;
  step_id: string;
  agent_role: string;
  input_artifacts: Array<{ id: string; role: string; content: string }>;
  preferred_provider: string;
  checkpoint_data?: Record<string, unknown>;
  config: {
    repo_path: string;
    feature_branch: string;
    max_tokens_budget: number;
    providers: Record<string, unknown>;
  };
}

export interface AgentResponse {
  type: 'complete' | 'fail' | 'checkpoint';
  agent_run_id: string;
  output_artifacts?: Array<{ role: string; content: string; git_commit_sha?: string }>;
  checkpoint_data?: Record<string, unknown>;
  tokens_used?: number;
  error_code?: string;
  error_message?: string;
  retryable?: boolean;
}
```

- [ ] **Step 2: Write failing test for executor**

```typescript
// packages/runner/test/executor.test.ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { AgentExecutor } from '../src/executor.js';
import type { AgentRequest } from '../src/agents/protocol.js';

describe('AgentExecutor', () => {
  it('runs a minimal agent script and returns complete response', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aww-exec-'));
    try {
      // Write a tiny fake agent script
      const agentScript = join(dir, 'fake-agent.mjs');
      await writeFile(agentScript, `
import { createInterface } from 'node:readline';
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const req = JSON.parse(line);
  const res = JSON.stringify({
    type: 'complete',
    agent_run_id: req.agent_run_id,
    output_artifacts: [{ role: 'PLAN', content: 'Generated plan' }],
    tokens_used: 100,
  });
  process.stdout.write(res + '\\n');
  process.exit(0);
});
`);
      const executor = new AgentExecutor({ scriptPath: agentScript, timeoutMs: 5000 });
      const req: AgentRequest = {
        type: 'run',
        agent_run_id: 'ar_1',
        step_id: 's_1',
        agent_role: 'planner',
        input_artifacts: [],
        preferred_provider: 'anthropic',
        config: { repo_path: dir, feature_branch: 'aww/ws/run', max_tokens_budget: 50000, providers: {} },
      };
      const res = await executor.run(req);
      expect(res.type).toBe('complete');
      expect(res.output_artifacts?.[0].content).toBe('Generated plan');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns fail response on timeout', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aww-exec-'));
    try {
      const agentScript = join(dir, 'hanging-agent.mjs');
      await writeFile(agentScript, 'setInterval(() => {}, 99999);');
      const executor = new AgentExecutor({ scriptPath: agentScript, timeoutMs: 500 });
      const req: AgentRequest = {
        type: 'run', agent_run_id: 'ar_2', step_id: 's_2', agent_role: 'planner',
        input_artifacts: [], preferred_provider: 'anthropic',
        config: { repo_path: dir, feature_branch: 'aww/ws/run', max_tokens_budget: 1000, providers: {} },
      };
      const res = await executor.run(req);
      expect(res.type).toBe('fail');
      expect(res.error_code).toBe('TIMEOUT');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run — must FAIL**

```bash
cd packages/runner && pnpm test executor -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 4: Implement executor.ts**

```typescript
// packages/runner/src/executor.ts
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { AgentRequest, AgentResponse } from './agents/protocol.js';

export class AgentExecutor {
  constructor(private opts: { scriptPath: string; timeoutMs: number }) {}

  run(req: AgentRequest): Promise<AgentResponse> {
    return new Promise((resolve) => {
      const child = spawn('node', [this.opts.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          type: 'fail',
          agent_run_id: req.agent_run_id,
          error_code: 'TIMEOUT',
          error_message: `Agent timed out after ${this.opts.timeoutMs}ms`,
          retryable: true,
        });
      }, this.opts.timeoutMs);

      const rl = createInterface({ input: child.stdout });
      rl.once('line', (line) => {
        clearTimeout(timer);
        try {
          const res = JSON.parse(line) as AgentResponse;
          resolve(res);
        } catch {
          resolve({ type: 'fail', agent_run_id: req.agent_run_id, error_code: 'PARSE_ERROR', error_message: line, retryable: false });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ type: 'fail', agent_run_id: req.agent_run_id, error_code: 'SPAWN_ERROR', error_message: err.message, retryable: false });
      });

      child.stdin.write(JSON.stringify(req) + '\n');
      child.stdin.end();
    });
  }
}
```

- [ ] **Step 5: Run — must PASS**

```bash
cd packages/runner && pnpm test executor -- --reporter=verbose
```

- [ ] **Step 6: Commit**

```bash
git add packages/runner/src/agents/protocol.ts packages/runner/src/executor.ts packages/runner/test/executor.test.ts
git commit -m "feat(runner): AgentExecutor subprocess pool with timeout kill"
```

---

## Task 11: Heartbeat Manager

**Files:**
- Create: `packages/runner/src/heartbeat.ts`
- Create: `packages/runner/test/heartbeat.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/runner/test/heartbeat.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HeartbeatManager } from '../src/heartbeat.js';
import type { RunnerApiClient } from '../src/api-client.js';

function makeClient(): RunnerApiClient {
  return { heartbeat: vi.fn().mockResolvedValue(undefined), complete: vi.fn(), fail: vi.fn(), pollTask: vi.fn(), ackTask: vi.fn() } as unknown as RunnerApiClient;
}

describe('HeartbeatManager', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('sends heartbeat on interval', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const hb = new HeartbeatManager(client, 'ar_1', { intervalMs: 1000 });
    hb.start();
    await vi.advanceTimersByTimeAsync(2500);
    hb.stop();
    expect(client.heartbeat).toHaveBeenCalledTimes(2);
  });

  it('includes checkpoint_data in heartbeat', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const hb = new HeartbeatManager(client, 'ar_1', { intervalMs: 1000 });
    hb.updateCheckpoint({ phase: 'generating', tokens_used: 500 });
    hb.start();
    await vi.advanceTimersByTimeAsync(1100);
    hb.stop();
    expect(client.heartbeat).toHaveBeenCalledWith('ar_1', expect.objectContaining({ checkpoint_data: expect.objectContaining({ phase: 'generating' }) }));
  });
});
```

- [ ] **Step 2: Run — must FAIL**

```bash
cd packages/runner && pnpm test heartbeat -- --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3: Implement heartbeat.ts**

```typescript
// packages/runner/src/heartbeat.ts
import type { RunnerApiClient } from './api-client.js';

export class HeartbeatManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private checkpoint: Record<string, unknown> = {};

  constructor(
    private client: RunnerApiClient,
    private agentRunId: string,
    private opts: { intervalMs: number } = { intervalMs: 30_000 }
  ) {}

  updateCheckpoint(data: Record<string, unknown>): void {
    this.checkpoint = { ...this.checkpoint, ...data };
  }

  start(): void {
    this.timer = setInterval(() => {
      this.client.heartbeat(this.agentRunId, {
        checkpoint_data: this.checkpoint,
        ts: new Date().toISOString(),
      }).catch(() => {});
    }, this.opts.intervalMs);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd packages/runner && pnpm test heartbeat -- --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src/heartbeat.ts packages/runner/test/heartbeat.test.ts
git commit -m "feat(runner): HeartbeatManager with checkpoint tracking"
```

---

## Task 12: Registration + Daemon + CLI Entry

**Files:**
- Create: `packages/runner/src/registration.ts`
- Create: `packages/runner/src/daemon.ts`
- Create: `packages/runner/src/cli.ts`

- [ ] **Step 1: Implement registration.ts**

```typescript
// packages/runner/src/registration.ts
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface RegistrationResult {
  runner_id: string;
  runner_secret: string;
}

export async function registerRunner(opts: {
  base_url: string;
  registration_token: string;
  workspace_id: string;
  provider_ids: string[];
}): Promise<RegistrationResult> {
  const machine_id = randomUUID();
  const body = JSON.stringify({
    registration_token: opts.registration_token,
    machine_id,
    machine_hostname: hostname(),
    workspace_id: opts.workspace_id,
    capabilities: { agent_roles: ['planner', 'tasker', 'coder', 'tester', 'reviewer', 'summarizer'], providers: opts.provider_ids },
  });

  const res = await fetch(`${opts.base_url}/api/v1/runners/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Registration failed ${res.status}: ${text}`);
  }

  const json = await res.json() as { data: RegistrationResult };
  const result = json.data;

  // Persist runner credentials
  const awwDir = join(homedir(), '.aww');
  await mkdir(awwDir, { recursive: true });
  const runnerFile = join(awwDir, 'runner.json');
  await writeFile(runnerFile, JSON.stringify({ ...result, workspace_id: opts.workspace_id, base_url: opts.base_url }, null, 2), { mode: 0o600 });
  console.log(`Runner registered. Credentials saved to ${runnerFile}`);
  return result;
}
```

- [ ] **Step 2: Implement daemon.ts**

```typescript
// packages/runner/src/daemon.ts
import { loadConfig } from './config.js';
import { RunnerApiClient } from './api-client.js';
import { TaskPoller } from './poller.js';
import { AgentExecutor } from './executor.js';
import { HeartbeatManager } from './heartbeat.js';
import { ProviderRegistry } from './providers/registry.js';
import { AnthropicAdapter } from './providers/anthropic.js';
import { OpenAIAdapter } from './providers/openai.js';
import { OpenClawAdapter } from './providers/openclaw.js';
import { HermesAdapter } from './providers/hermes.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ClaimedTask } from './api-client.js';
import type { AgentRequest } from './agents/protocol.js';

export async function startDaemon(configPath?: string): Promise<void> {
  const cfgPath = configPath ?? join(homedir(), '.aww', 'config.toml');
  const cfg = await loadConfig(cfgPath);

  const providers = [
    cfg.providers.anthropic && new AnthropicAdapter(cfg.providers.anthropic),
    cfg.providers.openai && new OpenAIAdapter(cfg.providers.openai),
    cfg.providers.openclaw !== undefined && new OpenClawAdapter(cfg.providers.openclaw ?? {}),
    cfg.providers.hermes !== undefined && new HermesAdapter(cfg.providers.hermes ?? {}),
  ].filter(Boolean) as ProviderRegistry extends { providers: infer P } ? P : never[];

  // @ts-ignore
  const registry = new ProviderRegistry(providers);
  await registry.probe();
  console.log(`Available providers: ${registry.availableIds().join(', ')}`);

  const client = new RunnerApiClient({
    base_url: cfg.cloud.base_url,
    runner_id: cfg.runner.runner_id,
    runner_secret: cfg.runner.runner_secret,
  });

  const executor = new AgentExecutor({
    scriptPath: join(import.meta.dirname, 'agents', 'dispatcher.js'),
    timeoutMs: 10 * 60_000,
  });

  async function handleTask(task: ClaimedTask): Promise<void> {
    const hb = new HeartbeatManager(client, task.agent_run_id);
    hb.start();
    try {
      const req: AgentRequest = {
        type: 'run',
        agent_run_id: task.agent_run_id,
        step_id: task.step_id,
        agent_role: task.agent_role,
        input_artifacts: [],
        preferred_provider: task.preferred_provider,
        checkpoint_data: task.checkpoint_data,
        config: {
          repo_path: process.cwd(),
          feature_branch: '',
          max_tokens_budget: 200_000,
          providers: cfg.providers as Record<string, unknown>,
        },
      };
      const res = await executor.run(req);
      hb.stop();
      if (res.type === 'complete') {
        await client.complete(task.agent_run_id, { output_artifact_ids: [], exit_summary: res.tokens_used });
      } else {
        await client.fail(task.agent_run_id, { error_code: res.error_code, error_message: res.error_message, retryable: res.retryable });
      }
    } catch (err) {
      hb.stop();
      await client.fail(task.agent_run_id, { error_code: 'INTERNAL', error_message: String(err), retryable: true });
    }
  }

  const poller = new TaskPoller(client, handleTask);

  process.on('SIGTERM', () => { poller.stop(); process.exit(0); });
  process.on('SIGINT', () => { poller.stop(); process.exit(0); });

  console.log(`AWW Runner daemon started. Runner ID: ${cfg.runner.runner_id}`);
  await poller.run();
}
```

- [ ] **Step 3: Implement cli.ts**

```typescript
// packages/runner/src/cli.ts
import { Command } from 'commander';
import { startDaemon } from './daemon.js';
import { registerRunner } from './registration.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

const program = new Command();

program
  .name('aww')
  .description('AWW Local Runner CLI')
  .version('0.1.0');

program
  .command('runner:register')
  .description('Register this machine as an AWW Runner')
  .requiredOption('--token <token>', 'One-time registration token from AWW UI')
  .requiredOption('--url <url>', 'AWW Cloud base URL')
  .requiredOption('--workspace <id>', 'Workspace ID')
  .action(async (opts) => {
    await registerRunner({
      base_url: opts.url,
      registration_token: opts.token,
      workspace_id: opts.workspace,
      provider_ids: [],
    });
  });

program
  .command('runner:start')
  .description('Start the Runner daemon')
  .option('--config <path>', 'Path to config.toml', join(homedir(), '.aww', 'config.toml'))
  .action(async (opts) => {
    await startDaemon(opts.config);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Build and verify CLI runs**

```bash
cd packages/runner && pnpm build 2>&1 | head -30
node dist/cli.js --help
```

Expected: shows `runner:register` and `runner:start` commands

- [ ] **Step 5: Run all tests**

```bash
cd packages/runner && pnpm test -- --reporter=verbose
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/runner/src/registration.ts packages/runner/src/daemon.ts packages/runner/src/cli.ts
git commit -m "feat(runner): registration, daemon loop, CLI entry (aww runner:register + runner:start)"
```

---

## Task 13: Agent Stubs (Planner, Tasker, Coder, Tester, Reviewer, Summarizer)

**Files:**
- Create: `packages/runner/src/agents/dispatcher.ts` — selects agent by role
- Create: `packages/runner/src/agents/base-agent.ts` — shared LLM call + checkpoint logic

- [ ] **Step 1: Implement base-agent.ts**

```typescript
// packages/runner/src/agents/base-agent.ts
import { createInterface } from 'node:readline';
import type { AgentRequest, AgentResponse } from './protocol.js';
import { ProviderRegistry } from '../providers/registry.js';
import { AnthropicAdapter } from '../providers/anthropic.js';
import { OpenAIAdapter } from '../providers/openai.js';
import { OpenClawAdapter } from '../providers/openclaw.js';
import { HermesAdapter } from '../providers/hermes.js';

export abstract class BaseAgent {
  protected registry!: ProviderRegistry;

  async init(providersCfg: Record<string, unknown>): Promise<void> {
    const cfg = providersCfg as {
      anthropic?: { api_key: string };
      openai?: { api_key: string; base_url?: string };
      openclaw?: { gateway_url?: string };
      hermes?: { base_url?: string };
    };
    const adapters = [
      cfg.anthropic && new AnthropicAdapter(cfg.anthropic),
      cfg.openai && new OpenAIAdapter(cfg.openai),
      cfg.openclaw !== undefined && new OpenClawAdapter(cfg.openclaw ?? {}),
      cfg.hermes !== undefined && new HermesAdapter(cfg.hermes ?? {}),
    ].filter(Boolean) as ProviderRegistry extends { providers: infer P } ? P : never[];
    // @ts-ignore
    this.registry = new ProviderRegistry(adapters);
    await this.registry.probe();
  }

  abstract execute(req: AgentRequest): Promise<AgentResponse>;
}

export async function runAgentMain(agentFactory: (role: string) => BaseAgent): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  rl.once('line', async (line) => {
    const req = JSON.parse(line) as AgentRequest;
    const agent = agentFactory(req.agent_role);
    await agent.init(req.config.providers);
    try {
      const res = await agent.execute(req);
      process.stdout.write(JSON.stringify(res) + '\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({
        type: 'fail',
        agent_run_id: req.agent_run_id,
        error_code: 'AGENT_ERROR',
        error_message: String(err),
        retryable: true,
      }) + '\n');
    }
    process.exit(0);
  });
}
```

- [ ] **Step 2: Implement dispatcher.ts (agent selector)**

```typescript
// packages/runner/src/agents/dispatcher.ts
import { runAgentMain, BaseAgent } from './base-agent.js';
import type { AgentRequest, AgentResponse } from './protocol.js';
import type { CompletionRequest } from '../providers/types.js';

class PlannerAgent extends BaseAgent {
  async execute(req: AgentRequest): Promise<AgentResponse> {
    const systemPrompt = `You are a software engineering planner. Given a PRD artifact, produce a detailed engineering plan in Markdown.`;
    const userContent = req.input_artifacts.map((a) => `### ${a.role}\n${a.content}`).join('\n\n');

    const completion = await this.registry.complete({
      model: 'claude-opus-4-7',
      messages: [{ role: 'user', content: userContent }],
      system: systemPrompt,
      max_tokens: 8192,
    } satisfies CompletionRequest, req.preferred_provider);

    return {
      type: 'complete',
      agent_run_id: req.agent_run_id,
      output_artifacts: [{ role: 'PLAN', content: completion.content }],
      tokens_used: completion.tokens_used,
    };
  }
}

class TaskerAgent extends BaseAgent {
  async execute(req: AgentRequest): Promise<AgentResponse> {
    const systemPrompt = `You are a task breakdown specialist. Given an engineering plan, produce a numbered task list in Markdown with acceptance criteria per task.`;
    const planArtifact = req.input_artifacts.find((a) => a.role === 'PLAN');
    const completion = await this.registry.complete({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: planArtifact?.content ?? 'No plan provided' }],
      system: systemPrompt,
      max_tokens: 4096,
    }, req.preferred_provider);
    return {
      type: 'complete',
      agent_run_id: req.agent_run_id,
      output_artifacts: [{ role: 'TASK_LIST', content: completion.content }],
      tokens_used: completion.tokens_used,
    };
  }
}

class StubAgent extends BaseAgent {
  constructor(private role: string) { super(); }
  async execute(req: AgentRequest): Promise<AgentResponse> {
    return { type: 'complete', agent_run_id: req.agent_run_id, output_artifacts: [{ role: this.role.toUpperCase(), content: `[Stub: ${this.role} output]` }] };
  }
}

runAgentMain((role) => {
  switch (role) {
    case 'planner': return new PlannerAgent();
    case 'tasker': return new TaskerAgent();
    case 'coder': return new StubAgent('code_patch');
    case 'tester': return new StubAgent('test_report');
    case 'reviewer': return new StubAgent('review_comment');
    case 'summarizer': return new StubAgent('pr_summary');
    default: return new StubAgent(role);
  }
});
```

- [ ] **Step 3: Build and verify no TypeScript errors**

```bash
cd packages/runner && pnpm build 2>&1
```

Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add packages/runner/src/agents/
git commit -m "feat(runner): agent stubs (planner/tasker/coder/tester/reviewer/summarizer) with base-agent LLM loop"
```

---

## Verification

After all 13 tasks:

```bash
# All tests pass
cd packages/runner && pnpm test -- --reporter=verbose

# CLI help works
node packages/runner/dist/cli.js --help

# Config error shown on bad config
echo "[cloud]" > /tmp/bad.toml && node packages/runner/dist/cli.js runner:start --config /tmp/bad.toml 2>&1 | grep ConfigError
```

Expected: all tests PASS, CLI shows commands, ConfigError thrown for bad config.
