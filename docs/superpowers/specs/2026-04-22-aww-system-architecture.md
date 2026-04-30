# AWW MVP 系统架构与界面架构设计

> **版本**：v1.1  
> **日期**：2026-04-22  
> **变更**：新增 i18n（中英文切换）+ 扩展 LLM Provider 支持 OpenClaw / Hermes  
> **作者**：Architect Agent（基于 PRD v2 + Prototype v2）

---

## 0. 设计总览

AWW 是一个"控制平面在云端、执行平面在本地"的双层架构。云端（AWW Cloud）负责调度、状态机、制品索引、审计；本地（Local Runner）负责真实代码执行、Git、LLM 调用。二者通过"任务拉取 + 结果上报 + SSE 事件广播"模式解耦，前端通过 REST + SSE 与 AWW Cloud 交互，且永不直接触碰 Local Runner。

**设计核心主张：**
- **数据面最小化**：AWW Cloud 不触碰源代码文件，只存元数据 + 小型制品（plan、diff summary、review comments、test summary）。
- **状态机驱动**：每个 WorkflowStep 的 8 状态机是全系统真相来源，所有事件、UI 更新、Runner 动作均围绕它。
- **制品不可变**：Artifact 一旦 committed 即不可改，通过 `parent_artifact_id` 构建版本链，保证审计可追溯。
- **Human-in-the-loop 是一等公民**：approval-gate 是独立 owner_type，Decision 是独立实体，Take Over 有正式的状态过渡。

---

## 1. 系统架构图

### 1.1 顶层拓扑

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             Browser (React 18 SPA)                      │
│   路由 / 状态 / SSE client / API client / Optimistic UI                 │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │  HTTPS (REST + SSE)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              AWW Cloud                                  │
│                                                                         │
│  ┌───────────────────┐  ┌───────────────────┐  ┌────────────────────┐ │
│  │   API Layer       │  │  Service Layer    │  │   Data Layer       │ │
│  │  ───────────────  │  │  ──────────────   │  │  ────────────────  │ │
│  │  - HTTP Router    │  │  - WorkflowSvc    │  │  - Postgres        │ │
│  │  - Auth MW        │◄─┤  - RunnerSvc      │◄─┤  - Redis (pubsub+  │ │
│  │  - Validation     │  │  - ArtifactSvc    │  │    queue+cache)    │ │
│  │  - SSE Broadcaster│  │  - DecisionSvc    │  │  - S3/R2 (artifact │ │
│  │  - Webhook Recv   │  │  - AuditSvc       │  │    blobs)          │ │
│  │                   │  │  - StateMachine   │  │                    │ │
│  └───────────────────┘  └───────────────────┘  └────────────────────┘ │
└─────────┬─────────────────────────────────────────┬────────────────────┘
          │                                         │
          │ HTTPS (long-poll + heartbeat)           │ REST (OAuth token)
          │                                         │
          ▼                                         ▼
┌──────────────────────────────────────────┐   ┌──────────────────┐
│         Local Runner Daemon              │   │   GitHub API     │
│                                          │   │  (PR creation,   │
│  ┌────────────────────────────────────┐  │   │  status checks)  │
│  │        Runner Core                 │  │   └──────────────────┘
│  │  - Registration / Heartbeat        │  │           ▲
│  │  - Task Poller                     │  │           │
│  │  - Result Reporter                 │  │           │ git over HTTPS
│  │  - Checkpoint Writer               │  │           │ (user token)
│  └────────────┬───────────────────────┘  │           │
│               │                           │   ┌──────┴───────┐
│  ┌────────────▼─────────┐ ┌────────────┐ │   │   Git Repo   │
│  │  Agent Executor      │ │ Git Worker │─┼──▶│   (remote)   │
│  │  (subprocess pool)   │ │            │ │   └──────────────┘
│  └────────────┬─────────┘ └────────────┘ │
│               │                           │
│  ┌────────────▼─────────┐                │
│  │     LLM Client       │──────────────────────▶  LLM Provider
│  │  (Anthropic/OpenAI)  │                │       (user's key)
│  └──────────────────────┘                │
└──────────────────────────────────────────┘
```

### 1.2 AWW Cloud 内部分层

**API Layer（无状态，横向扩展）**
- HTTP Router：分资源路由（/workspaces、/runs、/steps、/artifacts、/decisions、/runners、/events）
- Auth Middleware：JWT 校验（user token）+ Runner token 校验（独立 scheme）
- Validation：Zod schema 在边界处统一校验
- SSE Broadcaster：订阅 Redis pubsub 频道，将事件推送给订阅的浏览器连接
- Webhook Receiver：接收 GitHub webhook（PR merged 等）

**Service Layer（业务逻辑，可注入 mock 测试）**
- WorkflowService：创建 Run、驱动状态机（状态迁移、步骤推进）
- RunnerService：Runner 注册、认领任务、接收心跳、超时清扫（watchdog 120s）
- ArtifactService：版本链管理、parent_artifact_id 校验、blob 上传下载
- DecisionService：记录 Decision、触发状态机副作用（Approve → 下一步；Reject → 终止；Request Changes → 回滚）
- AuditService：append-only 事件日志
- StateMachine：WorkflowStep 8 状态机 + Artifact 3 状态机（draft/committed/superseded）

**Data Layer**
- Postgres（主数据）：所有关系型数据、JSONB 字段存 checkpoint_data / metadata
- Redis：三重用途
  - pubsub：事件广播到 SSE Broadcaster
  - 任务队列：pending agent runs 的 FIFO 队列（Runner 认领来源）
  - 缓存：Workspace membership、Runner 在线状态
- 对象存储（S3 兼容，R2 或 MinIO）：制品 blob（plan markdown、diff text、test log）

### 1.3 Local Runner 模块分解

**Runner Core（主进程）**
- Lifecycle Manager：启动注册、心跳循环、优雅关机
- Task Poller：从 AWW Cloud 拉取任务（long-poll，25s 超时，立即重连）
- Dispatcher：根据任务类型（Planner/Tasker/Coder/Tester/Reviewer/Summarizer）路由到对应 Agent Executor
- Result Reporter：上报 AgentRun 结果 + 上传制品（小制品走 JSON API，大制品走预签名 URL 直传对象存储）
- Checkpoint Writer：在关键节点（LLM 回复完、文件写入完、git commit 后）把 `checkpoint_data` 上报给服务端

**Agent Executor（子进程池）**
- 每个 AgentRun 独立子进程（进程级隔离，非 Docker，MVP 够用）
- Agent 以 stdin/stdout JSON-RPC 协议与 Runner Core 对话
- 统一 Agent 接口：`run(input_artifacts, context) -> output_artifacts + checkpoint_data`
- 资源限制：cgroups（Linux）/ RLIMIT / ulimit；Windows/macOS 退化为 timeout + 内存预警

**Git Worker**
- 封装 simple-git 或原生 git 子进程
- 关键操作：`clone`（首次）、`fetch`、`checkout -b aww/{slug}/{run-id-short}`、`add` + `commit` + `push`
- 冲突处理：如果 feature branch 在 push 时被拒（非 fast-forward），rebase onto 远端再 push
- 串行锁：同一 WorkflowRun 的所有 git 操作用 mutex 串行（避免多 Coding Agent 并发 commit 乱序）

**LLM Client**
- 统一抽象：`complete(messages, tools, model) -> response`（Provider Adapter 模式，各实现独立注册）
- 支持 Provider：
  - **Anthropic**：标准 HTTPS REST（`/v1/messages`），API key 本地配置
  - **OpenAI**：标准 HTTPS REST（`/v1/chat/completions`），兼容 OpenAI-compatible 端点
  - **OpenClaw**：通过 OpenClaw Gateway WebSocket（默认 `ws://localhost:18789`）调用，采用 `req/res/event` frame 与 connect-first 握手（`connect.challenge` -> `connect` -> `hello-ok`），Runner 启动时检测 Gateway 是否在线
  - **Hermes**：通过 Nous Hermes Agent API Server（OpenAI-compatible）调用，优先 `POST /v1/chat/completions`/`POST /v1/responses`，健康探测 `GET /health`（fallback `GET /health/detailed`），Runner 启动时检测可用性
  - 后置：本地 Ollama
- Token budget 管理：每个 AgentRun 有 max_tokens 配额，累计到阈值触发 checkpoint 保存 + 压缩（OpenClaw/Hermes 若不返回 token 计数则按字符数估算）
- 密钥来源：本地配置文件 `~/.aww/config.toml`，运行时加载，永不上报

### 1.4 通信协议

**AWW Cloud ↔ Local Runner**
- **注册**：Runner 启动时 POST `/api/runners/register`，携带 registration_token（用户从 UI 复制）+ machine_id + capabilities（支持的 agent 类型、LLM provider 列表）。服务端返回 `runner_id` + `runner_secret`（用于后续签名）。
- **任务拉取**：Runner 调用 GET `/api/runners/{id}/tasks/claim?timeout=25s`（long-poll）。服务端从 Redis 队列 BRPOP 对应 workspace/runner 的 pending agent runs；若 25s 无任务则返回 204，Runner 立即重连。
- **心跳**：Runner POST `/api/agent-runs/{id}/heartbeat` 每 30s 一次，携带 `checkpoint_data` 增量。
- **结果上报**：Runner POST `/api/agent-runs/{id}/complete`（或 `/fail`），携带最终制品 ID 列表 + 退出状态。大制品先 PUT 到预签名 URL，再上报 ID。
- **Watchdog**：AWW Cloud 定时任务扫描 `last_heartbeat_at > 120s` 的 in-progress AgentRun，标记为 `timeout`，触发 retry 或人工介入。

**前端 ↔ AWW Cloud**
- **REST**：所有 mutation（创建 Run、提交 Decision、编辑制品）走 REST
- **SSE**：GET `/api/workspaces/{id}/events`（带 JWT），服务端持有连接，订阅 Redis `workspace:{id}` pubsub 频道，收到事件推给客户端
- **事件 envelope**：`{ event_id, event_type, workspace_id, run_id?, step_id?, payload, timestamp }`
- **重连**：客户端带 `Last-Event-ID` header，服务端从 Redis Stream 回放遗漏事件（Stream 保留 24h）

**Local Runner ↔ GitHub**
- git 协议：标准 HTTPS git，凭据来自用户本机（用户已配置 gh CLI 或 credential helper）
- **MVP**：Runner 直接用用户本机的 `gh` CLI 创建 PR，完全不经过 AWW Cloud 存 token
- **Post-MVP**：GitHub App / OAuth 集成可由 AWW Cloud 使用加密 token 调 GitHub API，支持更丰富的 Checks、Statuses 和 Webhook 能力

**Local Runner ↔ LLM / AI Agent**
- 各 Provider 通过 Adapter 注册，Runner 启动时加载 `~/.aww/config.toml` 中的 `[providers]` 配置，实例化可用 Adapter 列表
- **Anthropic**：HTTPS REST，API key 读配置，失败重试（指数退避，429/529 最多 5 次），token 计数用响应 header `anthropic-ratelimit-tokens-remaining`
- **OpenAI**：HTTPS REST，兼容所有 OpenAI-compatible 端点（含本地代理），API key 读配置
- **OpenClaw**：WebSocket 连接到 OpenClaw Gateway（默认 `ws://localhost:18789`），连接后先处理 `connect.challenge` 并发送 `connect`，再按 `req`/`res`/`event` 语义收发；Runner 注册时上报 capabilities 里包含 `openclaw`；若 Gateway 不在线则该 Agent 类型标记不可用
- **Hermes**：HTTP 调用 Nous Hermes Agent API Server，端点为 `POST /v1/chat/completions`（必要时 `POST /v1/responses`），健康检查 `GET /health`（fallback `GET /health/detailed`），`base_url` 由配置提供；若 Hermes 服务未启动则标记不可用
- **模型路由**：每个 WorkflowStep 可配置 `preferred_provider`（workspace 级默认 + 步骤级覆盖），Runner 按可用 Provider 列表降级匹配

---

## 2. 技术栈推荐（MVP）

| 层 | 推荐 | 备选 | 理由 |
|---|---|---|---|
| AWW Cloud 后端 | **Node.js 20 + Fastify + TypeScript** | NestJS / Hono / FastAPI | 与前端同语言、Fastify 性能好且中间件生态成熟、schema-first（Zod + fastify-type-provider-zod）|
| ORM + DB | **Postgres 16 + Drizzle ORM** | Prisma / Kysely | Drizzle 轻量、SQL-first、TS 类型安全；Postgres JSONB 适合 checkpoint_data / metadata |
| 队列/调度 | **Redis 7（MVP 简化：Postgres SKIP LOCKED + Redis pubsub）** | BullMQ / SQS | MVP 避免运维 BullMQ 复杂性；Postgres SKIP LOCKED 5s 轮询足够；pubsub 独立用 Redis |
| 制品存储 | **Cloudflare R2**（S3 兼容） | AWS S3 / MinIO | R2 无出口费用；本地开发用 MinIO |
| 实时推送 | **SSE over Fastify**（原生 stream） | WebSocket / Pusher | SSE 单向够用、HTTP/2 多路复用友好、防火墙穿透好 |
| 前端框架 | **React 18 + Vite + TypeScript** | Next.js App Router | 现有原型已是 React，Vite 构建快；SPA 即可（无 SEO 需求）|
| 前端状态 | **Zustand + TanStack Query** | Redux Toolkit / Jotai | Zustand 管全局 UI 状态，TanStack Query 管服务端状态（缓存 + 乐观更新 + 失效）|
| 前端路由 | **React Router v6** | TanStack Router | 成熟、社区大、loader 模式适合数据预取 |
| UI 组件 | **Radix UI + Tailwind CSS** | shadcn/ui | Radix 无样式可访问性组件 + Tailwind 样式；shadcn/ui 已把二者粘合 |
| 国际化（i18n） | **i18next + react-i18next** | FormatJS / Lingui | i18next 生态最成熟，react-i18next 提供 `useTranslation` hook；支持命名空间按需加载，中英文切换零刷新 |
| Local Runner | **Node.js 20 + TypeScript**（pkg 打包单二进制） | Go / Rust | 与服务端共享类型；npm 生态（simple-git、@anthropic-ai/sdk）；若需零依赖单二进制可迁 Go |
| Runner 进程管理 | **Node `child_process.spawn` + 自研进程池** | PM2 / Docker | MVP 不引 Docker；每个 AgentRun 一个 spawn 子进程，stdout/stderr pipe，超时 kill |
| 认证 | **JWT (jose) + refresh token** | Auth0 / Clerk | 自建够用，GitHub OAuth 作为首个登录方式 |
| 观测 | **OpenTelemetry + Pino（日志）+ Sentry（错误）** | DataDog | OTel 标准；Pino 在 Fastify 里原生 |
| 测试 | **Vitest + Playwright + MSW** | Jest | Vite 生态一致；Playwright 覆盖端到端；MSW mock API |
| 部署 | **Fly.io / Railway（云）+ GitHub Releases（Runner 二进制）** | Vercel + Render | 云端需要长连接（SSE）和任务调度；Fly.io/Railway 适合；Vercel 不支持长连接 |

---

## 3. API 设计（核心端点）

所有端点 prefix：`/api/v1`；响应统一 envelope：`{ data, error, meta }`。

### 3.1 Workspace

| Method | Path | 说明 |
|---|---|---|
| POST | `/workspaces` | 创建工作区（身份：User JWT） |
| GET | `/workspaces` | 列出当前用户的工作区 |
| GET | `/workspaces/{id}` | 工作区详情 |
| PATCH | `/workspaces/{id}` | 更新元数据 |
| GET | `/workspaces/{id}/events` | SSE 事件流（长连接） |
| POST | `/workspaces/{id}/github/link` | 关联 GitHub repo + OAuth |
| POST | `/workspaces/{id}/members` | 加成员 |

### 3.2 WorkflowTemplate & WorkflowRun

| Method | Path | 说明 |
|---|---|---|
| GET | `/workflow-templates` | 列出模板（MVP 内置 1 个 9-step 模板） |
| POST | `/workspaces/{id}/runs` | 启动 Run，body: `{ template_id, trigger_type, inputs }` |
| GET | `/workspaces/{id}/runs` | Run 列表 |
| GET | `/runs/{id}` | Run 详情（含所有 Steps） |
| POST | `/runs/{id}/cancel` | 取消 Run |
| GET | `/runs/{id}/steps` | 步骤列表（带状态） |

### 3.3 WorkflowStep

| Method | Path | 说明 |
|---|---|---|
| GET | `/steps/{id}` | 步骤详情（含 input/output artifact 引用） |
| POST | `/steps/{id}/start` | 手动启动（通常由状态机自动触发，此端点用于重跑） |
| POST | `/steps/{id}/rerun` | 重跑当前步骤，body: `{ reason, reset_from_artifact_id? }` |
| POST | `/steps/{id}/take-over` | Human 接管，返回本地接管指引（branch 名、commit sha） |

### 3.4 Artifact

| Method | Path | 说明 |
|---|---|---|
| POST | `/artifacts` | 创建制品，body: `{ role, parent_artifact_id?, content_inline?, upload_url_request? }` |
| POST | `/artifacts/upload-url` | 请求预签名上传 URL（大制品） |
| GET | `/artifacts/{id}` | 制品元数据 |
| GET | `/artifacts/{id}/content` | 下载内容（小制品 inline，大制品 302 到预签名 GET URL） |
| POST | `/artifacts/{id}/commit` | 从 draft 转 committed，此后不可改 |
| GET | `/artifacts/{id}/lineage` | 版本谱系（递归 parent_artifact_id） |
| POST | `/artifacts/{id}/supersede` | 标记被某个新制品替代 |

### 3.5 Decision

| Method | Path | 说明 |
|---|---|---|
| POST | `/steps/{id}/decision` | 提交决策，body: `{ action: approve\|reject\|request_changes\|edit\|take_over, comment?, edited_artifact_id?, target_step_id? }` |
| GET | `/steps/{id}/decisions` | 决策历史 |

**POST `/steps/{id}/decision` 状态机副作用：**
- `approve`：Step → `completed`，推进到下一 Step
- `reject`：Step → `cancelled`，Run → `failed`
- `request_changes`：Step → `retrying`，随后回到 `running` 并创建新的 AgentRun
- `edit`：Step 保持当前状态，创建 `HUMAN_EDIT` Artifact（parent 指向原 output）
- `take_over`：Step → `human_owned`，生成本地接管指引

### 3.6 AgentRun

| Method | Path | 说明 |
|---|---|---|
| GET | `/agent-runs/{id}` | AgentRun 详情 |
| POST | `/agent-runs/{id}/heartbeat` | Runner 心跳（每 30s），body: `{ checkpoint_data, progress_message? }` |
| POST | `/agent-runs/{id}/complete` | 完成上报，body: `{ output_artifact_ids, exit_summary }` |
| POST | `/agent-runs/{id}/fail` | 失败上报，body: `{ error_code, error_message, retryable }` |
| GET | `/agent-runs/{id}/logs` | 日志（stream 或分页） |

### 3.7 Runner

| Method | Path | 说明 |
|---|---|---|
| POST | `/runners/register` | 注册，body: `{ registration_token, machine_id, capabilities }`；返回 `{ runner_id, runner_secret }` |
| POST | `/runners/{id}/heartbeat` | Runner 级心跳（区别于 AgentRun 心跳，每 60s） |
| GET | `/runners/{id}/tasks/claim?timeout=25` | Long-poll 认领任务 |
| POST | `/runners/{id}/tasks/{task_id}/ack` | 确认认领（防止任务丢失） |
| GET | `/workspaces/{id}/runners` | 列出 workspace 下的 runners + 在线状态 |
| POST | `/workspaces/{id}/registration-tokens` | 生成一次性 registration_token |

---

## 4. Local Runner 架构

### 4.1 进程模型

```
runner-daemon (PID 主进程)
├── event loop: task poller / heartbeat timer
├── child: agent-executor (PID, 每 AgentRun 一个)
│    └── spawns: LLM HTTP client (in-process)
├── child: git-worker (PID, 按需 spawn，短命)
└── ipc: unix socket / named pipe，暴露本地 CLI（`aww status`）
```

- **主进程**：Node.js 单实例，常驻，管理所有子进程生命周期
- **Agent 子进程**：每个 AgentRun 独立 spawn，子进程崩溃不影响主进程；通过 JSON-RPC over stdin/stdout 通信
- **Git Worker**：按需 spawn（每次 git 命令一个短命进程），主进程用 mutex 串行化同一 Run 的 git 操作
- **并发度**：默认 `max_concurrent_agents = 2`（可配置）

### 4.2 任务轮询机制

```
loop:
  response = GET /runners/{id}/tasks/claim?timeout=25s   # long-poll
  if response.task:
    ack(task.id)
    dispatch(task)   # async, 不阻塞 poller
  else:
    continue         # 立即重连
on_error:
  backoff: exponential(1s, 2s, 4s, 8s, max=30s) with jitter
```

- Long-poll 避免轮询风暴；25s 超时留 5s 余量给网络
- 任务认领使用 Redis BRPOPLPUSH 到 "processing" 队列，保证 at-least-once
- `ack` 调用后服务端从 processing 队列移除；未 ack 的任务 60s 后回到 pending 队列

### 4.3 Agent 执行沙箱

**MVP 选型：进程级隔离（非 Docker）**

理由：
- Docker 在 macOS/Windows 上性能差、启动慢（Desktop VM 开销）
- 用户机器上不一定装 Docker
- Agent 本质是 LLM 调用 + 文件读写 + shell 命令，进程级沙箱 MVP 够用

进程级沙箱约束：
- 子进程继承受限环境变量（白名单）
- cwd 固定在 Workspace 绑定的本地 repo 目录
- 超时 kill：LLM 调用 10min，shell 命令 5min
- 输出大小限制：stdout/stderr 各 10MB，超出截断

**Post-MVP**：切到 Docker 容器，每个 AgentRun 一个临时容器，挂载 repo 目录，网络可控。

### 4.4 Git 操作封装

**流程**（以 Coding Agent 为例）：

1. Runner 接到 Coding AgentRun 任务，payload 含 `workflow_run.feature_branch` 和 `base_commit_sha`
2. Git Worker：
   - `git fetch origin`
   - `git checkout {feature_branch}`（若不存在则 `git checkout -b {feature_branch} {base_commit_sha}`）
   - `git pull --ff-only`（同步远端最新）
3. Agent Executor 执行，修改文件
4. Git Worker：
   - `git add -A`
   - `git diff --cached --stat`（捕获 diff 摘要上报）
   - `git commit -m "aww(step-{step-id}): {agent-generated-message}"`
   - `git push origin {feature_branch}`（失败则 rebase onto 远端再 push，最多 3 次）
5. 捕获 commit SHA，作为 CODE_PATCH artifact 的 metadata 上报

**锁策略**：per-WorkflowRun mutex，key = `workflow-run:{id}`，用文件锁 `.aww/locks/{run-id}.lock`。

### 4.5 LLM / AI Agent 调用封装

**Provider Adapter 接口**

所有 Provider 实现同一接口，Runner 通过 `ProviderRegistry` 按 `preferred_provider` 路由：

```typescript
interface LLMProvider {
  id: string;                        // 'anthropic' | 'openai' | 'openclaw' | 'hermes'
  isAvailable(): Promise<boolean>;   // 探测 Provider 是否可用
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

interface CompletionRequest {
  model: string;
  messages: Message[];
  tools?: Tool[];
  max_tokens: number;
  system?: string;
}

interface CompletionResponse {
  content: string;
  tool_calls?: ToolCall[];
  tokens_used?: number;              // OpenClaw/Hermes 若无则 undefined
  stop_reason: 'end_turn' | 'max_tokens' | 'tool_use';
}
```

**各 Provider 适配细节**

- **AnthropicAdapter**：标准 REST，支持 `cache_control` prompt caching，token 计数从响应 header 读取
- **OpenAIAdapter**：标准 REST，兼容任何 OpenAI-compatible 端点（本地代理、Azure OpenAI 等）
- **OpenClawAdapter**：建立 WebSocket 连接到 `ws://localhost:18789`（OpenClaw Gateway）。协议层：3 种 frame——`req`（客户端发）、`res`（Gateway 回，按 `id` 匹配）、`event`（Gateway 主动推）。连接流程：Gateway 主动发 `event connect.challenge` → 客户端发 `req connect`（params 含 `client`、`protocol`，可选 `api_key`）→ Gateway 回 `res { message: "hello-ok" }`。补全流程：客户端发 `req llm.complete` → Gateway 可发若干 `event llm.stream { chunk }` 帧（客户端累加）→ 最终发 `res llm.complete { content, stop_reason }`。错误以 `res.error { code, message }` 返回，常见 code：`rate_limit`、`auth_failed`、`invalid_model`、`context_length`。`isAvailable()` 探测 Gateway 端口（2s 超时）
- **HermesAdapter**：HTTP 调用 Nous Hermes Agent API Server（OpenAI-compatible）；主调用 `POST /v1/chat/completions`（备选 `POST /v1/responses`），健康探测 `GET /health`（fallback `GET /health/detailed`），`base_url` 由配置提供（不固定端口），`isAvailable()` 调用 `GET /health` 2s 超时探测

**模型路由策略**

- 默认映射（可在 workspace 设置覆盖）：Planner/Reviewer → `claude-opus`，Coder → `claude-sonnet`，Summarizer → `claude-haiku`
- 步骤级 `preferred_provider` 可指定用 `openclaw` 或 `hermes` 执行特定 Agent 步骤
- 降级链：若 preferred provider 不可用，按优先级依次尝试可用列表

**Token budget**

每个 AgentRun 初始预算（如 200K tokens），每次 response 后累计，到 80% 触发 checkpoint + compact；到 100% 强制结束并报告。OpenClaw / Hermes 若不返回 token 计数，则按响应字符数 ×0.25 估算。

**失败分类**：429/529 重试；400 不重试；网络超时重试 3 次；OpenClaw Gateway 断线触发 WebSocket 重连（最多 3 次，指数退避）。

### 4.6 心跳与超时处理

- AgentRun 心跳：每 30s POST `/agent-runs/{id}/heartbeat`，带最新 `checkpoint_data` 和 `progress_message`
- Runner 级心跳：每 60s POST `/runners/{id}/heartbeat`
- 服务端 Watchdog（每 30s 跑一次）：
  - 扫描 `AgentRun where status=running AND last_heartbeat_at < now() - 120s`
  - 标记为 `timeout`，发 `agent_run.failed` 事件
  - 根据 retry 策略决定重投队列或终止
- Runner 崩溃恢复：重启后读本地 `.aww/state/` 目录，发现未 ack 的任务 → 上报 `fail(reason=runner_crash)`

### 4.7 断点续传（checkpoint_data）

**写入时机**（Agent 主动决定何时 checkpoint）：
- LLM 回复完整接收后
- 每次文件写入（batch）完成后
- Git commit 后
- Agent 内部"阶段"切换（如 Planner 从"分析 PRD"切到"生成 plan"）

**checkpoint_data 结构**（JSONB）：
```json
{
  "phase": "generating_tasks",
  "completed_steps": ["analyze_prd", "identify_modules"],
  "tokens_used": 45320,
  "llm_context_hash": "sha256:...",
  "intermediate_outputs": {}
}
```

**恢复逻辑**：AgentRun 因 timeout/fail 被重投时，新的 Runner 收到任务时读到 `checkpoint_data`，Agent 决定是从头再来还是从 checkpoint 继续（Agent 合约约定）。

---

## 5. 界面架构（Interface Architecture）

### 5.1 路由结构

**公开路由（未认证）**
- `/login` — 登录页（GitHub OAuth 触发）
- `/oauth/callback` — OAuth 回调
- `/m/approvals/:token` — 移动审批视图（短令牌免登录审批，令牌 24h 有效）

**认证路由**
- `/` — 根路由，重定向到 `/workspaces` 或上次访问的 workspace
- `/workspaces` — 工作区列表
- `/workspaces/new` — 创建工作区向导（3-step FTUE）
- `/w/:workspaceSlug` — 工作区概览（Run 列表 + Runner 状态 + 最近活动）
- `/w/:workspaceSlug/runs/new` — 启动新 Run
- `/w/:workspaceSlug/runs/:runId` — **主工作视图**（原型的核心界面），默认显示当前 active step
- `/w/:workspaceSlug/runs/:runId/steps/:stepId` — 指定步骤的详情视图
- `/w/:workspaceSlug/runs/:runId/steps/:stepId/artifacts/:artifactId` — 制品查看/编辑
- `/w/:workspaceSlug/runs/:runId/findings` — Finding Selector 全屏视图
- `/w/:workspaceSlug/runs/:runId/audit` — 完整审计日志
- `/w/:workspaceSlug/runners` — Runner 管理
- `/w/:workspaceSlug/runners/register` — 生成注册令牌 + 安装指引
- `/w/:workspaceSlug/settings` — 工作区设置（GitHub 关联、成员、模板）
- `/settings/account` — 账户设置
- `/settings/tokens` — API tokens

### 5.2 状态管理

**分层原则**：服务端状态（有权威源）与客户端状态（纯 UI）严格分离。

**TanStack Query（服务端状态）**
- 所有 REST 响应（workspaces, runs, steps, artifacts, decisions, agent runs, runners）
- Query key 规约：`['workspaces']`, `['run', runId]`, `['run', runId, 'steps']`, `['artifact', artifactId]`
- 默认 `staleTime: 30s`（SSE 会主动 invalidate，无需频繁 refetch）
- SSE 事件到达时调用 `queryClient.invalidateQueries()` 或 `setQueryData()`（细粒度补丁）

**Zustand（全局客户端状态）**
- `useAuthStore`：当前用户、JWT、refresh token
- `useWorkspaceStore`：当前活动 workspace（跨路由保持）
- `useRunnerStore`：Runner 在线状态（从 SSE 派生）
- `useSSEStore`：SSE 连接状态（connecting/open/reconnecting/error）+ 上次事件 ID
- `useUIStore`：抽屉开关、Modal 栈、当前选中的 step/artifact

**React Context**（局部）
- `WorkflowRunContext`：在 Run 详情页内共享 runId、currentStepId、selectedArtifactId，避免 prop drilling 到 FlowNav / PanelWrapper / FindingSel

**选型理由**
- **不用 Redux**：MVP 规模小，Redux 样板代码成本大于收益
- **不只用 Context**：全局状态（如 SSE 连接）用 Context 会导致大面积 re-render
- Zustand + TanStack Query 是 2024+ React SPA 的事实标准组合

### 5.3 组件架构

**层次结构**
```
App (Providers: QueryClient, Router, Auth, Toast, SSE)
 └── Layout
      ├── AppShell (顶栏 + 左侧 Sidebar)
      ├── <Outlet /> (路由渲染页面)
      └── GlobalModals (TakeOverModal, CommandPalette)
```

**Page 层**（路由对应）
- `WorkspacesPage`, `WorkspaceOverviewPage`, `RunDetailPage`, `RunnerMgmtPage`, `SettingsPage`

**Feature 层**（业务领域切分）

| 目录 | 包含组件 |
|---|---|
| `features/workflow-run/` | WorkflowTimeline, StepDetailPanel, AgentBanner, FlowNav |
| `features/approval/` | ApprovalActionBar, DecisionHistory, EditArtifactDrawer |
| `features/artifact/` | ArtifactList, ArtifactViewer (Markdown/Code/Plain), ArtifactLineage |
| `features/diff/` | DiffViewer, FileTree |
| `features/finding/` | FindingSel（抽屉）, FindingItem |
| `features/take-over/` | TakeOverModal, TakeOverInstructions |
| `features/runner/` | RunnerList, RunnerStatusBadge, RegistrationWizard |
| `features/audit/` | AuditFeed, AuditEventCard |
| `features/onboarding/` | EmptyState, FTUEWizard |

**Component 层**（跨 feature 复用）
- `PanelWrapper`, `Tabs`, `StatusPill`, `Avatar`, `Timeline`, `Drawer`, `Modal`, `CommandPalette`, `Toast`

**Primitive 层**（Radix + Tailwind 基础件）
- `Button`, `Input`, `Textarea`, `Select`, `Dialog`, `DropdownMenu`, `Tooltip`, `Popover`, `Badge`, `Glass`

**新增核心组件（原型未覆盖）**

| 组件 | 说明 |
|---|---|
| `SSEConnectionIndicator` | 右下角图标显示实时连接态 |
| `RunnerStatusBar` | 顶部条显示当前 workspace 的 runner 在线/离线 |
| `RegistrationWizard` | Runner 安装引导（下载 → 粘贴 token → 验证心跳） |
| `ArtifactLineageTree` | 版本链可视化（DAG 树）|
| `TokenBudgetMeter` | 显示当前 AgentRun 的 token 使用进度 |
| `CheckpointResumeDialog` | timeout 后询问"从 checkpoint 继续还是重头开始" |
| `ConflictResolutionBanner` | git push 冲突时的提示 + 手动解决入口 |
| `BulkApprovalView` | 跨 run 的待审批聚合（组织级 inbox）|

### 5.4 数据获取策略

**API 请求层封装**
- 单例 `api-client.ts`，基于 `fetch` 包装：统一 base URL、JWT 注入、错误规范化、refresh token 透明刷新
- 每个资源一个 hooks 模块：`useWorkspace(id)`, `useRun(id)`, `useSubmitDecision()` 等
- Mutation hooks 使用 TanStack Query 的 `useMutation`，`onMutate` 做乐观更新，`onError` 回滚

**SSE 连接管理**
- 入口：`useSSEConnection(workspaceId)` hook，在进入 workspace 路由时建立，离开时关闭
- 实现：`EventSource` 原生 API + 手动重连（需要重写以支持带 Last-Event-ID 的指数退避）
- 生命周期：`mount → connect → onopen → onmessage: dispatch → onerror → backoff → reconnect`
- 事件分发：`sseEventBus.emit(event_type, payload)`，各 feature 模块订阅感兴趣的事件
- TanStack Query 集成：收到 `step.status_changed` → `queryClient.setQueryData([...])`；收到 `artifact.created` → `queryClient.invalidateQueries([...])`

**Optimistic Updates 策略**

| 操作 | 乐观更新 | 理由 |
|---|---|---|
| 提交 Decision（approve/reject/request_changes） | **是** | 用户需要即时反馈，服务端校验失败概率低 |
| 编辑 Artifact（draft） | **是** | 编辑器输入流畅度关键 |
| 创建 Workspace / Run | **否** | 服务端生成 ID，无法乐观 |
| Rerun Step | **否** | 服务端状态机校验复杂 |
| Take Over | **否** | 需要服务端返回本地指引内容 |
| 触发 Agent | **否** | 依赖 Runner 可用性 |

### 5.5 国际化（i18n）

**框架**：`i18next` + `react-i18next`

**语言范围（MVP）**：中文（`zh-CN`，默认）和英文（`en`）

**文件结构**

```
src/
└── i18n/
    ├── index.ts           # i18next 初始化（detectLanguage + fallback）
    └── locales/
        ├── zh-CN/
        │   ├── common.json       # 通用词汇（保存/取消/确认…）
        │   ├── workflow.json     # 工作流相关术语
        │   ├── approval.json     # 审批动作文案
        │   └── errors.json       # 错误消息
        └── en/
            ├── common.json
            ├── workflow.json
            ├── approval.json
            └── errors.json
```

**语言检测顺序**

1. `localStorage` 中的用户偏好（key: `aww-lang`）
2. 浏览器 `navigator.language`
3. 默认 `zh-CN`

**语言切换**

- Sidebar 底部或 `SettingsView` 内提供 `LanguageToggle` 组件（中 / EN 切换按钮）
- 切换时调用 `i18n.changeLanguage(lang)` + 写入 `localStorage`，**零页面刷新**，所有 `useTranslation` hook 的组件自动重渲染
- 用户登录后，语言偏好同步到服务端 `user.preferred_language` 字段，下次跨设备登录时恢复

**使用约定**

```tsx
// 禁止在组件内硬编码中文或英文字符串
// ✗ <button>批准计划</button>
// ✓
const { t } = useTranslation('approval');
<button>{t('approve_plan')}</button>
```

- 所有用户可见字符串必须通过 `t()` 输出；技术标识符（branch 名、event type、Artifact role）不翻译
- 按命名空间（namespace）分文件，避免单一 `translation.json` 过大
- 日期/数字格式化使用 `i18next-browser-languagedetector` + `Intl` API（`Intl.DateTimeFormat`），不手写格式化逻辑
- 新增 `LanguageToggle` 到新增核心组件列表

**测试**

- Vitest 中每个业务组件测试默认 `lng: 'en'`（避免中文字符串匹配测试脆性）
- E2E 测试（Playwright）在 `zh-CN` 和 `en` 各跑一遍关键审批流程

---

## 6. 安全架构

### 6.1 GitHub OAuth 流程

1. 用户在 UI 点"关联 GitHub"
2. 前端跳转 `https://github.com/login/oauth/authorize?client_id=...&scope=repo&state={csrf_token}`
3. 用户授权，GitHub 回调 `https://aww.app/oauth/github/callback?code=...&state=...`
4. AWW Cloud 后端用 `code` 换取 `access_token`（服务端到服务端调用）
5. **Token 加密存储**：AES-256-GCM 加密，密钥来自 KMS（或 env var）；入库字段 `github_token_encrypted` + `github_token_nonce`
6. Post-MVP Runner 或 Cloud 服务按 GitHub App 权限模型使用短期 token，不在 Runner 本地落盘

**MVP 简化**：让用户在 Local Runner 本机用 `gh auth login`，Runner 直接调用本机 `gh` CLI 做 PR 创建；AWW Cloud 不存 token。Level 2 集成在 MVP 即此形态。

### 6.2 Runner 注册令牌机制

1. 用户在 UI `/runners/register` 页面点"生成注册令牌"
2. 后端生成一次性 `registration_token`（32 字节 random，base64url，TTL 10min，单次使用），存 Redis
3. 用户在 Runner 机器上：`aww runner register --token <xxx>`
4. Runner POST `/runners/register`，服务端校验 token + 消费（Redis DEL）
5. 响应 `{ runner_id, runner_secret }`，Runner 写入本机 `~/.aww/runner.json`（chmod 600）
6. 后续所有 Runner API 请求带 `Authorization: Runner {runner_id}:{hmac-sha256(body, runner_secret)}` 头
7. **撤销**：UI 可"吊销 runner"，删除 runner 记录，后续请求 401

### 6.3 API 认证

- **用户 API**：`Authorization: Bearer <jwt>`，JWT 15min 过期
- **Refresh token**：httpOnly cookie，7 天有效，旋转式（每次刷新返回新 refresh + 旧 refresh 入黑名单）
- **Runner API**：HMAC 签名（上述）
- **移动审批短 token**：`POST /approvals/short-tokens`，生成 URL token（24h），短信/邮件发给审批人

### 6.4 制品访问控制

- **Workspace 是主隔离边界**：所有 Artifact 归属 Workspace
- **成员角色**：owner / admin / contributor / reviewer / viewer
- **访问策略**：viewer 只读；contributor 可提交 Decision；admin 创建 Run + 管理 Runner；owner 管理成员
- **预签名 URL**：对象存储下载用短期预签名 URL（15min），URL 中嵌入 artifact_id + workspace_id，服务端签发时检查权限
- **Runner 权限**：Runner 只能访问其所在 workspace 的制品，HMAC 签名包含 runner_id，服务端校验 runner 与 workspace 的绑定

### 6.5 审计日志完整性

- **append-only**：`audit_events` 表，只 INSERT，无 UPDATE/DELETE
- **哈希链**：`self_hash = sha256(prev_hash || canonical_json(payload) || created_at)`；prev_hash 指向同 workspace 的上一条事件
- **周期性 anchor**：每日将最新 hash 存到独立存储（S3 with Object Lock），防止全量数据库被篡改
- **验证 CLI**：`aww audit verify --workspace <id>` 遍历哈希链，发现断链报警

---

## 7. 扩展路径（Post-MVP）

**进程级沙箱 → Docker 容器**
每个 AgentRun 启动临时容器，挂载 repo 只读/读写卷，网络策略白名单。收益：强隔离、资源限额、可重放。代价：macOS/Windows 性能、Docker Desktop 依赖。

**数据库轮询 → 消息队列**
Postgres SKIP LOCKED 在 >100 QPS 调度下会成为瓶颈，切到 BullMQ（Redis）或 Kafka，支持 delayed / priority / 多消费者。同时可引入 Temporal 管理长流程状态机。

**单一 GitHub → GitHub App（Level 3）**
GitHub App 走 installation token（短期、细粒度 permission），支持 Check Runs、Statuses、Commit Comments，把 Agent 的 review finding 直接发回 PR，支持 webhook 订阅（push、PR review、comment）。

**单工作流 → 并行多 Agent**
同一 Run 内某些 Step 支持 fan-out（如"3 个 Reviewer 并行"，结果合并），状态机扩展 `aggregation` 类型节点，Runner 端支持并行子进程池。

**Local Runner → 云沙箱（SaaS 模式）**
AWW 提供托管 Runner 池（Firecracker microVM 或 E2B 类方案），用户 repo clone 到托管 sandbox，LLM key 由 AWW 代管（可选）或 BYOK，复用同一 Runner API 契约，实现 SaaS + 自托管双模式。

---

## 8. 核心决策摘要

1. **云+本地双层，数据面最小化**：源代码永不上 AWW 服务端，Runner 在本机执行所有 git/LLM/shell 操作。
2. **技术栈：Node.js + TypeScript 全栈**，Fastify（后端）、React 18 + Vite（前端）、Drizzle + Postgres（ORM/DB）、Redis 用于 pubsub + 队列 + 缓存，R2 存制品。
3. **前端状态：Zustand + TanStack Query + React Router v6**。Zustand 管 UI 状态，TanStack Query 管服务端状态，Context 管局部共享。
4. **Runner 进程模型**：Node.js 主进程 + spawn 子进程池，MVP 不用 Docker；任务 long-poll 拉取（25s），AgentRun 心跳 30s，Watchdog 120s 超时判定。
5. **状态机是真相来源**：WorkflowStep 8 状态机 + Artifact 3 状态机驱动整个系统；所有 SSE 事件、UI 视图、Runner 动作均围绕状态迁移。
6. **制品不可变 + 版本链**：`parent_artifact_id` 构成 DAG，Decision 的 edit 操作产生新版本而非覆盖。
7. **SSE 优于 WebSocket**：单向推送够用、HTTP/2 多路复用、断线重连原生支持、带 Last-Event-ID 回放遗漏事件。
8. **安全三要素**：GitHub token 服务端 AES-256-GCM 加密（MVP 退化为本机 `gh` CLI 零托管）；Runner HMAC 签名认证；审计日志哈希链 + 每日 anchor。
9. **前端组件分层**：Primitive / Component / Feature / Page / Layout 五层，Feature 按业务领域垂直切分（9 个 feature 目录）。
10. **i18n：中英文零刷新切换**：i18next + react-i18next，命名空间按业务域分文件（common / workflow / approval / errors），语言偏好存 localStorage 并同步服务端，测试默认 `en` 避免中文字符串匹配脆性。
11. **LLM Provider Adapter 模式**：统一 `LLMProvider` 接口，支持 Anthropic / OpenAI / OpenClaw（WebSocket Gateway ws://localhost:18789）/ Hermes（本地 REST）；Runner 启动时探测可用 Provider，按步骤级 `preferred_provider` 配置路由，不可用时降级。
12. **跨计划类型约定（Cross-plan type contract）**：P1 Drizzle `.$inferSelect` 类型是全系统 canonical source；P2 `ClaimedTask` 接口和 P3 各 hook 的返回类型必须与 P1 schema 字段名对齐（snake_case，与 API 响应一致）。`BUILTIN_9STEP_TEMPLATE.steps[].agentRole` 值必须与 P2 `dispatcher.ts` switch cases 完全匹配（`planner|tasker|coder|tester|reviewer|summarizer`）。`WorkflowStep.status` 枚举（8 值）和 `Artifact.role` 枚举（8 值）定义在 P1 schema，P2/P3 只引用不重定义。

---

*文档生成：AWW Architect Agent · 2026-04-22 | v1.1 修订：2026-04-22*
